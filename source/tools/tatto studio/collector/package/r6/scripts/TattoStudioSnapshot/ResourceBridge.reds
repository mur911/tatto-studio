// Read-only resource access. ResourceAsyncRef's script_ref type is preserved here.
// Keep the exact Uint64 hash as well as the engine's resolved depot path.
public class TattoStudioSnapshotResource extends IScriptable {
  public let path: String;
  public let hash: Uint64;
}

@addMethod(Entity)
public func TattoStudioGetComponentResource(component: ref<IComponent>) -> ref<TattoStudioSnapshotResource> {
  let reference: ResourceAsyncRef;
  let morph = component as entMorphTargetSkinnedMeshComponent;
  let skinned = component as entSkinnedMeshComponent;
  let mesh = component as MeshComponent;
  if IsDefined(morph) {
    reference = morph.morphResource;
  } else {
    if IsDefined(skinned) {
      reference = skinned.mesh;
    } else {
      if IsDefined(mesh) {
        reference = mesh.mesh;
      } else {
        return null;
      };
    };
  };
  let result = new TattoStudioSnapshotResource();
  result.path = ResRef.ToString(ResourceAsyncRef.GetPath(reference));
  result.hash = ResourceAsyncRef.GetHash(reference);
  return result;
}

// AnimatedComponent uses synchronous rRef fields. Preserve their native
// script_ref<ResourceRef> type instead of relying on Lua's raw wrapper.
@addMethod(Entity)
public func TattoStudioGetAnimationResource(component: ref<IComponent>, graph: Bool) -> ref<TattoStudioSnapshotResource> {
  let animated = component as AnimatedComponent;
  let reference: ResourceRef;
  if !IsDefined(animated) {
    return null;
  };
  if graph {
    reference = animated.graph;
  } else {
    reference = animated.rig;
  };
  let result = new TattoStudioSnapshotResource();
  result.path = ResRef.ToString(ResourceRef.GetPath(reference));
  result.hash = ResourceRef.GetHash(reference);
  return result;
}
