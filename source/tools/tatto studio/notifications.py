"""Localized launch and recovery errors before the web UI is available."""
import ctypes
import json
import os
from pathlib import Path
from messages import describe,ROWS

LANGUAGES=['zh-CN','en','fr','it','ja','de','es','pt-BR','ru']


def preference_file():
    return Path(os.environ.get('LOCALAPPDATA',str(Path.home()/'AppData/Local')))/'Tatto Studio/ui-language.json'


def remember(language):
    if language not in LANGUAGES:raise ValueError('Invalid language.')
    path=preference_file();path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_suffix('.pending');temp.write_text(json.dumps({'language':language}),encoding='utf-8');temp.replace(path)


def language():
    try:
        value=json.loads(preference_file().read_text(encoding='utf-8'))['language']
        if value in LANGUAGES:return value
    except (OSError,ValueError,KeyError,TypeError):pass
    locale=ctypes.create_unicode_buffer(85)
    try:ctypes.windll.kernel32.GetUserDefaultLocaleName(locale,len(locale))
    except (AttributeError,OSError):return 'en'
    base=locale.value.split('-')[0].lower()
    return next((value for value in LANGUAGES if value.split('-')[0].lower()==base),'en')


def text(value,selected=None):
    info=describe(str(value));message=ROWS[info['id']][LANGUAGES.index(selected or language())]
    for i,param in enumerate(info['params']):message=message.replace('{'+str(i)+'}',str(param))
    return message


def show(value,log=None):
    message=text(value)+(('\n\n'+str(log)) if log else '')
    ctypes.windll.user32.MessageBoxW(None,message,'Tatto Studio',0x10)
