"""Loopback-only local tattoo editor and Vortex-package exporter."""
import argparse,io,json,os,pathlib,re,secrets,threading,time
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from urllib.parse import urlparse,unquote,parse_qs
from lifecycle import BrowserLifetime
from storage_paths import SOURCE_IMAGES_NAME
from PIL import Image
import library,models,publisher,settings,profiles,skins,image_input,standalone
import launcher, publishstate, relocation, subprocess, traceback, snapshot_identity
from render_versions import WARP_VERSION
from messages import describe

ROOT=pathlib.Path(__file__).parent.resolve()
WEB=ROOT/'web';EXPORTS=settings.DATA_ROOT/'exports'
JOBS={};LOCK=threading.Lock();TOKEN=os.environ.pop('TATTO_STUDIO_SESSION_TOKEN','')
if not re.fullmatch(r'[0-9a-f]{48}',TOKEN):TOKEN=secrets.token_hex(24)

def restart_status():
    try:return json.loads((settings.DATA_ROOT/'path-restart.json').read_text(encoding='utf-8'))
    except (OSError,ValueError):return {}

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*a):pass
    def send(self,code,value,kind='application/json; charset=utf-8'):
        if isinstance(value,dict):
            for field in ('error','message'):
                if isinstance(value.get(field),str):value={**value,field+'_info':describe(value[field])}
        if isinstance(value,dict) and 'error' in value:
            print('Operation failed: '+str(value['error']),flush=True)
        data=json.dumps(value,ensure_ascii=False).encode() if not isinstance(value,bytes) else value
        self.send_response(code);self.send_header('Content-Type',kind);self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(data)
    def allowed(self):
        return self.headers.get('Host') in {f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'}
    def do_GET(self):
        if not self.allowed():return self.send(403,{'error':'仅允许本机访问'})
        path=unquote(urlparse(self.path).path)
        if path=='/api/session':
            value=parse_qs(urlparse(self.path).query).get('token',[''])[0]
            if not secrets.compare_digest(value,TOKEN):return self.send(403,{'error':'请求来源无效'})
            return self.server.browser_lifetime.stream(self)
        if path=='/api/config':return self.send(200,{'application':'tatto studio','launcher_protocol':3,'library_publish_mode':'editor-mod','path_restart':restart_status(),'needs_configuration':not launcher.validate(settings.VALUES) or (settings.VALUES.get('setup_confirmed_version')!='1.0.1' or settings.VALUES.get('setup_confirmation_revision')!=2),'application_root':str(ROOT),'data_directory':str(settings.DATA_ROOT),'token':TOKEN,'ready':(ROOT/'templates/json/tattoos.app.json').exists(),'version':'1.0.1','publication':getattr(self.server,'publication',{}),'installation_mode':settings.VALUES.get('installation_mode','vortex'),'overlay_profile_version':profiles.VERSION,'surface_warp_version':WARP_VERSION,'exports':str(EXPORTS),'library_path':str(library.LIBRARY.resolve()),'texture_pipeline':publisher.TEXTURE_PIPELINE_VERSION,'busy':publisher.PUBLISH_LOCK.locked() or any(j['state']=='running' for j in list(JOBS.values()))})
        if path in ('/','/studio4.html') and (not launcher.validate(settings.VALUES) or (settings.VALUES.get('setup_confirmed_version')!='1.0.1' or settings.VALUES.get('setup_confirmation_revision')!=2)):
            return self.send(200,(WEB/'setup.html').read_bytes(),'text/html; charset=utf-8')
        if path=='/api/library':return self.send(200,library.groups())
        if path.startswith('/api/library/thumbnail/'):
            try:
                ids=path[len('/api/library/thumbnail/'):].split('/')
                if len(ids)!=2:raise ValueError('图片路径无效')
                file=library.design_path(*ids).parent/SOURCE_IMAGES_NAME/'01.png'
                if not file.is_file():return self.send(204,b'','image/png')
                with Image.open(file) as im:
                    im.thumbnail((96,96));out=io.BytesIO();im.convert('RGBA').save(out,format='PNG')
                return self.send(200,out.getvalue(),'image/png')
            except (OSError,ValueError):return self.send(404,b'','image/png')
        if path=='/api/log':
            log=settings.DATA_ROOT/'editor-service.log'
            return self.send(200,log.read_bytes()[-131072:] if log.exists() else b'', 'text/plain; charset=utf-8')
        if path=='/api/models':return self.send(200,models.listed())
        if path.startswith('/api/jobs/'):
            job=JOBS.get(path.rsplit('/',1)[-1]);return self.send(200 if job else 404,job or {'error':'未找到任务'})
        root=EXPORTS if path.startswith('/exports/') else models.MODELS if path.startswith('/models/') else WEB
        relative=path[len('/exports/'):] if root==EXPORTS else path[len('/models/'):] if root==models.MODELS else path.lstrip('/') or 'studio4.html'
        target=(root/relative).resolve()
        if not target.is_relative_to(root) or not target.is_file():return self.send(404,{'error':'文件不存在'})
        if root==models.MODELS and target.name=='model.json':
            import tattoo_regions
            return self.send(200,tattoo_regions.update_metadata(target.parent))
        types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.bin':'application/octet-stream','.png':'image/png','.zip':'application/zip','.txt':'text/plain; charset=utf-8'}
        return self.send(200,target.read_bytes(),types.get(target.suffix,'application/octet-stream'))
    def do_POST(self):
        lifetime=self.server.browser_lifetime
        if not lifetime.begin_request():return self.send(503,{'error':'编辑器正在关闭，请重新启动'})
        try:return self.handle_POST()
        finally:lifetime.end_request()
    def handle_POST(self):
        if not self.allowed() or self.headers.get('X-Studio-Token')!=TOKEN:return self.send(403,{'error':'请求来源无效'})
        origin=self.headers.get('Origin')
        if origin and origin not in {f'http://127.0.0.1:{self.server.server_port}',f'http://localhost:{self.server.server_port}'}:return self.send(403,{'error':'请求来源无效'})
        route=urlparse(self.path).path
        if route.startswith('/api/setup/'):
            if route not in ('/api/setup/inspect','/api/setup/browse','/api/setup/save'):
                return self.send(404,{'error':'Unknown setup operation.'})
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=32768:raise ValueError('Invalid setup request size.')
                payload=json.loads(self.rfile.read(length))
                if not isinstance(payload,dict):raise ValueError('Invalid setup request.')
                if route=='/api/setup/inspect':
                    paths={**launcher.resolve_paths(settings.read()),'data_directory':str(settings.DATA_ROOT)}
                    previous=paths.get('library_publish_target')
                    if previous and not publishstate.valid_target(previous):
                        try:
                            if json.loads((pathlib.Path(previous)/publishstate.MARKER).read_text(encoding='utf-8')).get('owner')==publishstate.OWNER:paths['library_publish_target']=''
                        except (OSError,ValueError,AttributeError):pass
                    return self.send(200,{'paths':paths,'library_targets':publishstate.candidates()})
                if route=='/api/setup/browse':
                    from windows_picker import choose
                    return self.send(200,{'path':choose(payload.get('field'))})
                lifetime=self.server.browser_lifetime
                with LOCK:
                    with lifetime.lock:
                        if lifetime.requests>1 or publisher.PUBLISH_LOCK.locked() or any(job['state']=='running' for job in JOBS.values()):
                            return self.send(409,{'error':'Wait for the current editor operation to finish before changing paths.'})
                        if not launcher.validate(payload):raise ValueError('The selected paths are invalid. Configuration was not changed.')
                        # A target choice belongs to the selected staging root, not the old one.
                        chosen=payload.get('library_publish_target','')
                        if chosen:
                            folder=pathlib.Path(chosen).resolve()
                            if payload.get('installation_mode')=='manual':
                                if folder!=(pathlib.Path(payload['game_directory'])/'archive/pc/mod').resolve():raise ValueError('Select the game archive/pc/mod folder for manual deployment.')
                            else:
                                staging=pathlib.Path(payload['vortex_staging_directory']).resolve()
                                if not folder.is_relative_to(staging) or len(folder.relative_to(staging).parts)!=4 or folder.parts[-3:]!=('archive','pc','mod') :raise ValueError('Select the installed Tatto Studio editor archive/pc/mod folder.')
                                if not publishstate.editor_target(folder):raise ValueError('Select the installed Tatto Studio editor archive/pc/mod folder.')
                        target=relocation.prepare(settings.DATA_ROOT,payload.get('data_directory') or str(settings.DATA_ROOT),use_existing=payload.get('use_existing') is True,staging=payload.get('vortex_staging_directory'),game=payload.get('game_directory'))
                        existing=launcher.read_settings(target)
                        launcher.save_settings(target,existing,payload)
                        lifetime.closing=True
                        restart_id=secrets.token_hex(12)
                environment=os.environ.copy();environment['TATTO_STUDIO_SESSION_TOKEN']=TOKEN
                with (settings.DATA_ROOT/'editor-restart.log').open('ab') as log:
                    subprocess.Popen([str(ROOT/'runtime/python/pythonw.exe'),'-B',str(ROOT/'restart_service.py'),'--port',str(self.server.server_port),'--data',str(target),'--previous',str(settings.DATA_ROOT),'--id',restart_id],env=environment,cwd=ROOT,stdin=subprocess.DEVNULL,stdout=log,stderr=log,close_fds=True)
                self.send(200,{'saved':True,'restarting':True,'data_directory':str(target),'restart_id':restart_id})
                threading.Thread(target=self.server.shutdown,daemon=True).start()
                return
            except (ValueError,TypeError,OSError) as error:
                if hasattr(self.server,'browser_lifetime'):self.server.browser_lifetime.closing=False
                return self.send(400,{'error':str(error)})
        if route=='/api/launcher/stop':
            lifetime=self.server.browser_lifetime
            with LOCK:
                with lifetime.lock:
                    busy=(lifetime.requests>1 or publisher.PUBLISH_LOCK.locked() or any(job['state']=='running' for job in list(JOBS.values())))
                    if not busy:lifetime.closing=True
            if busy:
                return self.send(409,{'error':'The editor is saving or updating. Wait for it to finish.'})
            self.send(200,{'stopping':True})
            threading.Thread(target=self.server.shutdown,daemon=True).start()
            return
        if route=='/api/preferences/language':
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<1024:raise ValueError('Invalid language.')
                from notifications import remember
                remember(json.loads(self.rfile.read(length))['language'])
                return self.send(200,{'saved':True})
            except (ValueError,KeyError,TypeError,OSError) as error:return self.send(400,{'error':str(error)})
        if not launcher.validate(settings.VALUES):return self.send(409,{'error':'Complete the path setup before using the editor.'})
        if route not in {'/api/design/export-mod','/api/library/group','/api/library/rename','/api/library/rename-design','/api/library/delete','/api/library/restore','/api/library/save','/api/library/load','/api/library/enable','/api/library/publish','/api/library/backup','/api/library/open','/api/library/reorder','/api/models/compare','/api/models/coverage','/api/library/preflight','/api/images/convert','/api/models/import','/api/models/skin','/api/models/pose'}:return self.send(404,{'error':'不存在的操作'})
        try:
            length=int(self.headers.get('Content-Length','0'))
            if not 0<length<256*1024*1024:raise ValueError('设计文件过大')
            payload=json.loads(self.rfile.read(length))
            if route in ('/api/library/group','/api/library/rename','/api/library/rename-design','/api/library/delete','/api/library/restore','/api/library/save','/api/library/enable','/api/library/backup','/api/library/reorder') and publisher.PUBLISH_LOCK.locked():return self.send(409,{'error':'正在发布纹身库，完成后即可修改'})
            if route=='/api/models/compare':
                atlases=None
                if payload.get('design_id'):
                    design=library.load(payload['group_id'],payload['design_id'])
                    if design.get('model',{}).get('id')!=payload['id']:raise ValueError('请先重新读取角色模型')
                    atlases=snapshot_identity.design_atlases(library,payload['group_id'],payload['design_id'])
                result=snapshot_identity.compare(payload['id'],atlases)
                if payload.get('design_id'):
                    import design_coverage
                    result['coverage']=design_coverage.check(design)
                    result['compatible']=result['compatible'] and result['coverage']['complete']
                return self.send(200,result)
            if route=='/api/models/coverage':
                import design_coverage
                project=library.load(payload['group_id'],payload['design_id'])
                return self.send(200,design_coverage.validate(project,payload['id'],snapshot_identity.design_atlases(library,payload['group_id'],payload['design_id'])))
            if route=='/api/library/preflight':return self.send(200,snapshot_identity.preflight(library))
            if route=='/api/images/convert':return self.send(200,image_input.convert(payload['image']))
            if route=='/api/library/reorder':return self.send(200,library.reorder(payload['kind'],payload['ids'],payload.get('group_id')))
            if route=='/api/library/group':return self.send(200,library.create_group(payload['name']))
            if route=='/api/library/rename':return self.send(200,library.rename_group(payload['group_id'],payload['name']))
            if route=='/api/library/rename-design':return self.send(200,library.rename_design(payload['group_id'],payload['design_id'],payload['name']))
            if route=='/api/library/delete':return self.send(200,library.delete(payload['group_id'],payload.get('design_id')))
            if route=='/api/library/restore':return self.send(200,library.restore(payload['ticket']))
            if route=='/api/library/save':return self.send(200,library.save(payload['group_id'],payload['title'],payload['project'],payload.get('design_id'),payload.get('atlases'),require_ink=payload.get('require_ink') is True,reuse=payload.get('reuse')))
            if route=='/api/library/load':return self.send(200,library.load(payload['group_id'],payload['design_id']))
            if route=='/api/library/backup':return self.send(200,library.backup_group(payload['group_id']))
            if route=='/api/library/enable':return self.send(200,library.enable(payload['group_id'],payload['design_id'],payload['enabled']))
            if route=='/api/library/open':
                folder=library.design_path(payload['group_id'],payload['design_id']).parent if payload.get('design_id') else library.group_folder(payload['group_id']) if payload.get('group_id') else library.LIBRARY
                os.startfile(str(folder.resolve()))
                return self.send(200,{'path':str(folder.resolve())})
            with LOCK:
                if any(j['state']=='running' for j in JOBS.values()):return self.send(409,{'error':'已有导出任务，请等待完成'})
                if not (ROOT/'templates/json/tattoos.app.json').exists():raise ValueError('模板尚未准备好')
                job_id=time.strftime('%Y%m%d_%H%M%S')+'_'+secrets.token_hex(3)
                JOBS[job_id]={'state':'running','message':'准备导出…'}
            if route in ('/api/design/export-mod','/api/library/publish','/api/models/import','/api/models/skin','/api/models/pose'):
                def worker():
                    job=JOBS[job_id]
                    try:
                        def progress(message):job.update(message=message,message_info=describe(message))
                        if route=='/api/design/export-mod':
                            result=standalone.build(EXPORTS/job_id,payload,progress)
                            job.update(download='/exports/'+job_id+'/'+result['file'],project='/exports/'+job_id+'/design.tattoo.json')
                        elif route=='/api/library/publish':result=publisher.publish(progress,acknowledgment=payload.get('snapshot_acknowledgment'))
                        elif route=='/api/models/pose':
                            import model_pose
                            result=model_pose.prepare(payload['id'],progress)
                        elif route=='/api/models/skin':result=skins.prepare(payload['id'],progress,force=payload.get('force') is True)
                        else:
                            result=models.import_current(progress);profiles.prepare(result['id'],progress)
                            try:skins.prepare(result['id'],progress,force=True)
                            except (ValueError,OSError) as error:result.update(skin_warning=str(error),skin_warning_info=describe(str(error)))
                        job.update(state='done',message='独立模组已导出。' if route=='/api/design/export-mod' else '发布完成，请自行部署。' if route=='/api/library/publish' else '皮肤参考已读取。' if route=='/api/models/skin' else '角色资源已读取。',result=result)
                    except Exception as e:
                        traceback.print_exc()
                        job.update(state='error',message=str(e),message_info=describe(str(e)))
                    finally:job['finished']=time.time()
                threading.Thread(target=worker,daemon=True).start()
            return self.send(202,{'id':job_id})
        except (ValueError,KeyError,TypeError,OSError) as e:
            traceback.print_exc()
            return self.send(400,{'error':str(e)})

if __name__=='__main__':
    args=argparse.ArgumentParser();args.add_argument('--port',type=int,default=8770);args.add_argument('--library',type=pathlib.Path);args.add_argument('--sandbox',action='store_true');parsed=args.parse_args()
    if parsed.library:library.LIBRARY=parsed.library.resolve();library.LIBRARY.mkdir(parents=True,exist_ok=True)
    if parsed.sandbox:
        if not parsed.library:args.error('--sandbox requires --library')
        publisher.WORK=library.LIBRARY.parent/'build';publisher.STAGING=library.LIBRARY.parent/'staging';publisher.OUTPUT=library.LIBRARY.parent/'test-library.zip'
    EXPORTS.mkdir(exist_ok=True)
    server=ThreadingHTTPServer(('127.0.0.1',parsed.port),Handler)
    server.browser_lifetime=BrowserLifetime()
    try:
        publishstate.bootstrap();server.publication=publishstate.restore()
    except Exception as error:
        traceback.print_exc();server.publication={'error':str(error),'error_info':describe(str(error))}
    def browser_busy():return publisher.PUBLISH_LOCK.locked() or any(job['state']=='running' for job in list(JOBS.values()))
    threading.Thread(target=server.browser_lifetime.watch,args=(server,browser_busy),daemon=True).start()
    print(f'tatto studio: http://127.0.0.1:{parsed.port}',flush=True)
    try:server.serve_forever()
    finally:
        server.browser_lifetime.stopped.set()
        server.server_close()

