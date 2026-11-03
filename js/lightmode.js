export function applyLightMode({ scene, ambientLight, keyLight, flashlight, wallMaterial, floorMaterial, enemyMaterials }) {
  scene.background.set(0xb6d4dc);
  scene.fog.color.set(0xb6d4dc);
  scene.fog.near = 25;
  scene.fog.far = 75;
  ambientLight.intensity = 1.35;
  keyLight.intensity = 1.6;
  flashlight.intensity = 0.35;
  wallMaterial.color.set(0xffffff);
  floorMaterial.color.set(0xffffff);
  for (const material of enemyMaterials) material.emissive?.set(0x06180f);
  document.body.classList.add("theme-light");
  document.body.classList.remove("theme-dark");
}
