import * as OBC from "@thatopen/components";


const components = new OBC.Components();

const worlds = components.get(OBC.Worlds);
const world = worlds.create();

// Encuentra en la página el elemento cuyo id es "viewer"
const viewerDiv = document.getElementById("viewer");


world.scene = new OBC.SimpleScene(components);
world.scene.setup();
world.scene.three.background = null;

//const container = document.getElementById("container")!;
world.renderer = new OBC.SimpleRenderer(components, viewerDiv);
world.camera = new OBC.OrthoPerspectiveCamera(components);
// Espera a que termine este movimiento antes de seguir.”
await world.camera.controls.setLookAt(78, 20, -2.2, 26, -4, 25);

components.init();

components.get(OBC.Grids).create(world);

/*Al cargar un archivo IFC, el motor primero lo convierte en fragmentos y luego lo carga en la escena. */

console.log("Visor BIM inicializado");

// --- IFC LOADER ---
const ifcLoader = components.get(OBC.IfcLoader);


//   configurar web-ifc (la biblioteca principal encargada de leer archivos IFC) 
await ifcLoader.setup({
  autoSetWasm: false,
  wasm: {
    path: "https://unpkg.com/web-ifc@0.0.74/",
    absolute: true,
  },
});



/*
Cuando un archivo IFC se convierte a Fragmentos, otro componente gestiona el archivo convertido: FragmentsManager. 
Por lo tanto, es fundamental configurar este componente antes de intentar cargar cualquier archivo IFC:
*/ 

const githubUrl = "https://thatopen.github.io/engine_fragment/resources/worker.mjs";
const fetchedUrl = await fetch(githubUrl);
const workerBlob = await fetchedUrl.blob();
const workerFile = new File([workerBlob], "worker.mjs", {
  type: "text/javascript",
});
const workerUrl = URL.createObjectURL(workerFile);
const fragments = components.get(OBC.FragmentsManager);
fragments.init(workerUrl);

world.camera.controls.addEventListener("update", () => fragments.core.update());

// Ensures that once the Fragments model is loaded
// (converted from the IFC in this case),
// it utilizes the world camera for updates
// and is added to the scene.
fragments.list.onItemSet.add(({ value: model }) => {
  model.useCamera(world.camera.three);
  world.scene.three.add(model.object);
  fragments.core.update(true);
});

// Remove z fighting
fragments.core.models.materials.list.onItemSet.add(({ value: material }) => {
  if (!("isLodMaterial" in material && material.isLodMaterial)) {
    material.polygonOffset = true;
    material.polygonOffsetUnits = 1;
    material.polygonOffsetFactor = Math.random();
  }
});

async function loadIfcFromUrl(url) {
  const file = await fetch(url);
  const data = await file.arrayBuffer();
  const buffer = new Uint8Array(data);
  await ifcLoader.load(buffer, false, "example", {
    processData: {
      progressCallback: (progress) => console.log(progress),
    },
  });
};

const demoIfc =
  "https://raw.githubusercontent.com/andrewisen/bim-whale-ifc-samples/main/AdvancedProject/IFC/AdvancedProject.ifc";

await loadIfcFromUrl(demoIfc);
console.log("IFC demo solicitado");