"""Read only the two Vortex path settings; never open or modify its database."""
import argparse
import json
import os
from pathlib import Path
import struct

WANTED = {
    b'settings###mods###installPath###cyberpunk2077': 'vortex_staging_directory',
    b'settings###gameMode###discovered###cyberpunk2077###path': 'game_directory',
}


def varint(data, pos=0):
    value = 0
    for shift in range(0, 70, 7):
        byte = data[pos]; pos += 1
        value |= (byte & 127) << shift
        if byte < 128:
            return value, pos
    raise ValueError('Invalid database integer')


def blob(data, pos):
    length, pos = varint(data, pos)
    end = pos + length
    if end > len(data):
        raise ValueError('Incomplete database value')
    return data[pos:end], end


def snappy(data):
    size, pos = varint(data)
    if size > 64 * 1024 * 1024:
        raise ValueError('Oversized database block')
    out = bytearray()
    while pos < len(data):
        tag = data[pos]; pos += 1
        kind = tag & 3
        if kind == 0:
            length = tag >> 2
            if length < 60:
                length += 1
            else:
                count = length - 59
                length = int.from_bytes(data[pos:pos+count], 'little') + 1
                pos += count
            out.extend(data[pos:pos+length]); pos += length
        else:
            if kind == 1:
                length = 4 + ((tag >> 2) & 7)
                offset = ((tag & 224) << 3) | data[pos]; pos += 1
            else:
                length = 1 + (tag >> 2)
                count = 2 if kind == 2 else 4
                offset = int.from_bytes(data[pos:pos+count], 'little'); pos += count
            if not 0 < offset <= len(out):
                raise ValueError('Invalid database copy')
            for _ in range(length):
                out.append(out[-offset])
        if len(out) > size:
            raise ValueError('Invalid database block size')
    if len(out) != size:
        raise ValueError('Incomplete database block')
    return bytes(out)


def records(data):
    """LevelDB fragmented journal records, ignoring an incomplete final write."""
    pos = 0; partial = bytearray()
    while pos + 7 <= len(data):
        remaining = 32768 - pos % 32768
        if remaining < 7:
            pos += remaining; continue
        length = int.from_bytes(data[pos+4:pos+6], 'little')
        kind = data[pos+6]
        if kind == 0 and length == 0:
            pos += remaining; continue
        if length + 7 > remaining or pos + 7 + length > len(data):
            break
        payload = data[pos+7:pos+7+length]; pos += 7 + length
        if kind == 1:
            partial.clear(); yield payload
        elif kind == 2:
            partial = bytearray(payload)
        elif kind == 3:
            partial.extend(payload)
        elif kind == 4:
            partial.extend(payload); yield bytes(partial); partial.clear()


def active_files(manifest):
    tables = set(); logs = set(); current_log = previous_log = 0
    for record in records(manifest):
        pos = 0
        while pos < len(record):
            tag, pos = varint(record, pos)
            if tag == 1:
                _, pos = blob(record, pos)
            elif tag in (2, 3, 4, 9):
                value, pos = varint(record, pos)
                if tag == 2: current_log = value
                if tag == 9: previous_log = value
            elif tag == 5:
                _, pos = varint(record, pos); _, pos = blob(record, pos)
            elif tag == 6:
                _, pos = varint(record, pos); number, pos = varint(record, pos)
                tables.discard(number)
            elif tag == 7:
                _, pos = varint(record, pos); number, pos = varint(record, pos)
                _, pos = varint(record, pos)
                _, pos = blob(record, pos); _, pos = blob(record, pos)
                tables.add(number)
            else:
                raise ValueError('Unsupported Vortex database format')
    logs.update(n for n in (current_log, previous_log) if n)
    return tables, logs


def entries(block):
    if len(block) < 4:
        raise ValueError('Incomplete database table')
    count = int.from_bytes(block[-4:], 'little')
    limit = len(block) - 4 * (count + 1)
    pos = 0; key = b''
    while pos < limit:
        shared, pos = varint(block, pos)
        fresh, pos = varint(block, pos)
        length, pos = varint(block, pos)
        if shared > len(key) or pos + fresh + length > limit:
            raise ValueError('Invalid database entry')
        key = key[:shared] + block[pos:pos+fresh]; pos += fresh
        value = block[pos:pos+length]; pos += length
        yield key, value


def table_entries(data):
    if data[-8:] != bytes.fromhex('57fb808b247547db'):
        raise ValueError('Unsupported Vortex database table')
    footer = data[-48:]
    _, pos = varint(footer); _, pos = varint(footer, pos)
    index_offset, pos = varint(footer, pos); index_size, _ = varint(footer, pos)

    def block(offset, size):
        if offset + size + 5 > len(data):
            raise ValueError('Incomplete database table block')
        value = data[offset:offset+size]; compression = data[offset+size]
        if compression == 0: return value
        if compression == 1: return snappy(value)
        raise ValueError('Unsupported database compression')

    for _, handle in entries(block(index_offset, index_size)):
        offset, pos = varint(handle); size, _ = varint(handle, pos)
        yield from entries(block(offset, size))


def read_paths(folder):
    """Use a stable manifest snapshot, including unflushed WAL changes."""
    folder = Path(folder)
    for _ in range(3):
        try:
            current = (folder/'CURRENT').read_bytes()
            name = current.decode('ascii').strip()
            if not name.startswith('MANIFEST-') or '/' in name or '\\' in name:
                return {}
            manifest = (folder/name).read_bytes()
            tables, logs = active_files(manifest)
            latest = {}

            def accept(key, value, sequence, kind):
                if key in WANTED and (key not in latest or sequence > latest[key][0]):
                    latest[key] = (sequence, value if kind else None)

            for number in tables:
                table = folder/f'{number:06d}.ldb'
                if not table.exists(): table = folder/f'{number:06d}.sst'
                for key, value in table_entries(table.read_bytes()):
                    if len(key) < 8: continue
                    tag = int.from_bytes(key[-8:], 'little')
                    accept(key[:-8], value, tag >> 8, tag & 255)
            # A newer journal can exist before its number reaches the manifest.
            logs.update(int(p.stem) for p in folder.glob('*.log') if p.stem.isdigit() and int(p.stem) >= max(logs, default=0))
            for number in logs:
                journal = folder/f'{number:06d}.log'
                if not journal.exists(): continue
                for batch in records(journal.read_bytes()):
                    if len(batch) < 12: continue
                    seq, count = struct.unpack_from('<QI', batch); pos = 12
                    for index in range(count):
                        kind = batch[pos]; pos += 1
                        key, pos = blob(batch, pos)
                        value = None
                        if kind == 1: value, pos = blob(batch, pos)
                        elif kind != 0: raise ValueError('Unsupported journal record')
                        accept(key, value, seq + index, kind)
            if (folder/'CURRENT').read_bytes() != current or (folder/name).read_bytes() != manifest:
                continue
            result = {}
            for key, (_, value) in latest.items():
                if value is None: continue
                parsed = json.loads(value)
                if isinstance(parsed, str) and parsed:
                    result[WANTED[key]] = parsed
            return result
        except (OSError, ValueError, IndexError, UnicodeError, struct.error):
            continue
    return {}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--state', type=Path, default=Path(os.environ.get('APPDATA', ''))/'Vortex/state.v2')
    args = parser.parse_args()
    print(json.dumps(read_paths(args.state), ensure_ascii=True))
