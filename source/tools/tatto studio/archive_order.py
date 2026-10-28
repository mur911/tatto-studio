"""Use one resource priority for geometry, skin and exported mesh dependencies."""


def ordered_mods(game):
    folder = game / 'archive/pc/mod'
    archives = sorted(folder.glob('*.archive'), key=lambda p: p.name)
    order = folder / 'modlist.txt'
    if not order.is_file():
        return archives
    names = [s.strip() for s in order.read_text(encoding='utf-8-sig').splitlines() if s.strip()]
    known = {p.name: p for p in archives}
    if len(names) != len(set(names)) or any(n not in known for n in names) or set(names) != set(known):
        raise ValueError('modlist.txt 未完整、唯一列出已部署 archive，无法可靠读取资源优先级')
    return [known[n] for n in names]


def ordered_archives(game):
    return ordered_mods(game) + sorted((game/'archive/pc/ep1').glob('*.archive')) + sorted((game/'archive/pc/content').glob('*.archive'))
