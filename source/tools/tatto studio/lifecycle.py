"""Track live browser connections without background-tab timer dependence."""
import threading
import time


class BrowserLifetime:
    def __init__(self, grace=8, startup=120, clock=time.monotonic):
        self.grace = grace
        self.startup = startup
        self.clock = clock
        self.created = clock()
        self.last_disconnect = None
        self.clients = set()
        self.requests = 0
        self.closing = False
        self.lock = threading.Lock()
        self.stopped = threading.Event()

    def connect(self):
        with self.lock:
            if self.closing:
                return None
            client = object()
            self.clients.add(client)
            return client

    def disconnect(self, client):
        with self.lock:
            self.clients.discard(client)
            if not self.clients:
                self.last_disconnect = self.clock()

    def begin_request(self):
        with self.lock:
            if self.closing:
                return False
            self.requests += 1
            return True

    def end_request(self):
        with self.lock:
            self.requests -= 1

    def should_stop(self, busy=False):
        with self.lock:
            if self.closing or self.clients or self.requests or busy:
                return False
            deadline = self.created + self.startup if self.last_disconnect is None else self.last_disconnect + self.grace
            if self.clock() < deadline:
                return False
            self.closing = True
            return True

    def watch(self, server, busy):
        while not self.stopped.wait(.5):
            if self.should_stop(busy()):
                server.shutdown()
                return

    def stream(self, handler):
        client = self.connect()
        if client is None:
            return handler.send(503, {'error': 'Editor is closing. Start tatto studio again.'})
        try:
            handler.connection.settimeout(5)
            handler.send_response(200)
            handler.send_header('Content-Type', 'text/event-stream')
            handler.send_header('Cache-Control', 'no-store')
            handler.send_header('X-Content-Type-Options', 'nosniff')
            handler.end_headers()
            while not self.stopped.is_set():
                handler.wfile.write(b': connected\n\n')
                handler.wfile.flush()
                if self.stopped.wait(2):
                    break
        except (OSError, TimeoutError):
            pass
        finally:
            self.disconnect(client)
