export function applyDarkMode({ scene, ambientLight, keyLight, flashlight, wallMaterial, floorMaterial, enemyMaterials }) {
  scene.background.set(0x050a12);
  scene.fog.color.set(0x050a12);
  scene.fog.near = 8;
  scene.fog.far = 32;
  ambientLight.intensity = 0.22;
  keyLight.intensity = 0.28;
  flashlight.intensity = 3.3;
  wallMaterial.color.set(0xb5c0ca);
  floorMaterial.color.set(0x8e9aa4);
  for (const material of enemyMaterials) material.emissive?.set(0x12352a);
  document.body.classList.add("theme-dark");
  document.body.classList.remove("theme-light");
}
