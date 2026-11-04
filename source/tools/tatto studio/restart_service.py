"""Restart only our local editor after the old server has released its port."""
import argparse
import json
import os
from pathlib import Path
import time
import traceback
import launcher
import relocation


def status(folder,ident,state):
    path=folder/'path-restart.json';temp=path.with_suffix('.pending')
    temp.write_text(json.dumps({'id':ident,'state':state}),encoding='utf-8');temp.replace(path)


def restart(options):
    previous=Path(options.previous);target=Path(options.data)
    try:
        for _ in range(200):
            if launcher.probe(options.port) is None:break
            time.sleep(.1)
        else:raise RuntimeError('The previous editor is still running.')
        relocation.remember(target)
        os.environ['TATTO_STUDIO_DATA_DIR']=str(target)
        status(target,options.id,'starting')
        launcher.start_server(options.port,target)
        status(target,options.id,'complete')
        return 'complete'
    except Exception:
        with (previous/'editor-restart.log').open('a',encoding='utf-8') as log:traceback.print_exc(file=log)
        relocation.remember(previous)
        os.environ['TATTO_STUDIO_DATA_DIR']=str(previous)
        try:
            status(previous,options.id,'rolled-back')
            launcher.start_server(options.port,previous)
            return 'rolled-back'
        except Exception:
            with (previous/'editor-restart.log').open('a',encoding='utf-8') as log:traceback.print_exc(file=log)
            from notifications import show
            show('Tatto Studio could not restart. Run Start tatto studio.cmd again. See editor-restart.log in your original data folder.')
            return 'failed'


if __name__=='__main__':
    args=argparse.ArgumentParser();args.add_argument('--port',type=int,required=True);args.add_argument('--data',required=True);args.add_argument('--previous',required=True);args.add_argument('--id',default='')
    restart(args.parse_args())
