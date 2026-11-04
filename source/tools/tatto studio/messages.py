"""Stable localized message envelopes; detailed diagnostics remain in the log."""
import json
from pathlib import Path
import re

ROWS=json.loads((Path(__file__).parent/'messages.json').read_text(encoding='utf-8'))
EXACT={text:(ident,row) for ident,row in ROWS.items() for text in (row[0],row[1])}
PATTERNS=[]
for ident,row in ROWS.items():
    if '{0}' not in row[0]:continue
    keys=[];parts=[];at=0
    for m in re.finditer(r'\{(\d+)\}',row[0]):
        parts.extend([re.escape(row[0][at:m.start()]),'(.*?)']);keys.append(int(m[1]));at=m.end()
    parts.append(re.escape(row[0][at:]));PATTERNS.append((re.compile('^'+''.join(parts)+'$',re.S),keys,ident,len(row[0])))
PATTERNS.sort(key=lambda x:x[3],reverse=True)


def describe(value):
    text=str(value).strip()
    if text in EXACT:
        ident,row=EXACT[text];return {'id':ident,'params':[],'fallback':row[1],'source':row[0]}
    for pattern,keys,ident,_ in PATTERNS:
        match=pattern.match(text)
        if match:
            args=['']*(max(keys)+1)
            for k,v in zip(keys,match.groups()):args[k]=v
            return {'id':ident,'params':args,'fallback':ROWS[ident][1],'source':ROWS[ident][0]}
    for prefix,source in [('转换 ','正在转换资源：{0}'),('准备 ','正在准备资源：{0}'),('补齐纹身接缝：','正在补齐纹身接缝：{0}')]:
        if text.startswith(prefix):
            info=describe(source);info['params']=[text[len(prefix):]];return info
    aliases=[
        (r'Multiple game librar', '发现多个游戏纹身库，请在路径设置选择发布位置。'),
        (r'target.*valid|target differs|independent game library', '路径无效，请检查设置。'),
        (r'destination contains data', '目标目录已有数据，请选择使用已有数据或另选空目录。'),
        (r'not enough free space', '空间不足，无法复制个人数据。'),
        (r'verification failed', '数据校验失败，原目录未更改。'),
        (r'data folder is unavailable', '个人数据目录不可用，请连接对应磁盘后重试。'),
        (r'outside the game', '个人数据必须保存在游戏和受管理模组目录之外。'),
        (r'Wait for|before changing paths|saving or updating|已有.*任务|正在发布', '当前任务完成后才能更改路径。'),
        (r'paths are invalid|path.*invalid|Complete the path|路径|game_directory', '路径无效，请检查设置。'),
        (r'缓存|Cached texture', '纹身库缓存无效，需要重新烘焙后保存。'),
        (r'转换失败|构建失败|Oodle|压缩库|Runtime|runtime|WolvenKit|timed out', '资源转换失败，请查看日志并检查 WolvenKit CLI 和所需运行库。'),
        (r'快照|骨骼|网格|顶点|模型资源', '当前角色资源不完整，请重新读取快照。'),
        (r'完成|已读取|已导出', '已完成，请部署生成的纹身库。'),
        (r'准备|转换 |批量提取|打包|补齐|生成', '正在处理资源，请稍候…'),
        (r'无效|超出|必须|不能|超过|invalid|must|cannot', '输入内容无效，请检查参数。'),
    ]
    for expression,source in aliases:
        if re.search(expression,text,re.I):return describe(source)
    return describe('操作失败，请查看日志了解详细原因。')
