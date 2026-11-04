"""Image processing revisions, separate from mesh and compression caches."""
WARP_VERSION = 2


def stale_warp(project):
    return any(layer.get('projection')=='warp' and layer.get('placed') and layer.get('visible') is not False for layer in project.get('layers',[])) and project.get('warpVersion',0)<WARP_VERSION
