import type { Mesh } from "@babylonjs/core/Meshes/mesh";

/** Normalize a mesh for absolute thin-instance matrices and isolate its VAO state. */
export function prepareThinInstanceHost(mesh: Mesh): void {
  mesh.parent = null;
  mesh.position.setAll(0);
  mesh.rotationQuaternion = null;
  mesh.rotation.setAll(0);
  mesh.scaling.setAll(1);
  mesh.isPickable = false;
  // Babylon caches VAOs on geometry; hosts sharing one clobber each other's
  // instance-buffer bindings and can silently disappear.
  mesh.makeGeometryUnique();
}
