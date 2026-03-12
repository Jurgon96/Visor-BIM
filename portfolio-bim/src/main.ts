import * as OBC from "@thatopen/components";
import * as FRAGS from "@thatopen/fragments";
import * as THREE from "three";
import * as BUI from "@thatopen/ui";

const components = new OBC.Components();

const worlds = components.get(OBC.Worlds);
const world = worlds.create<
  OBC.SimpleScene,
  OBC.OrthoPerspectiveCamera,
  OBC.SimpleRenderer
>();

// Encuentra en la página el elemento cuyo id es "viewer"
const container = document.getElementById("viewer")!


world.scene = new OBC.SimpleScene(components);
world.scene.setup();
world.scene.three.background = null;

//const container = document.getElementById("container")!;
world.renderer = new OBC.SimpleRenderer(components, container);
world.camera = new OBC.OrthoPerspectiveCamera(components);
// Espera a que termine este movimiento antes de seguir.”
await world.camera.controls.setLookAt(68, 23, -8.5, 21.5, -5.5, 23);

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
const classifier = components.get(OBC.Classifier);
const hider = components.get(OBC.Hider);

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

async function loadIfcFromUrl(url:any) {
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

/**
 *! USO de CLASSIFIERS
 */
// Crea automáticamente grupos por categoría IFC. Eso permitirá tener cosas como muros, losas, puertas, ventanas, etc., agrupadas por tipo.
const addDefaultGroupings = async () => {
  await classifier.byCategory();
  await classifier.byIfcBuildingStorey({ classificationName: "Levels" });
};

console.log("Clasificación por categoría y por plantas creada");
console.log(classifier.list);
// Si BUI.Manager.init() no se ejecuta , el navegador solo ve <bim-table> como un HTML normal:
BUI.Manager.init()
console.log("Modelos fragmentados cargados:", [...fragments.list.keys()]);
console.log("Fragments list:", fragments.list);



type GroupsTableData = {
  Classification: string;
  Name: string;
  Actions: string;
};

interface GroupsTableState {
  components: OBC.Components;
}

const groupsTableTemplate = (_state: GroupsTableState) => {
  const onCreated = (e?: Element) => {
    if (!e) return;
    const table = e as BUI.Table<GroupsTableData>;

    table.loadFunction = async () => {
      const data: BUI.TableGroupData<GroupsTableData>[] = [];

      for (const [classification, groups] of classifier.list) {
        for (const [name] of groups) {
          data.push({
            data: { Name: name, Classification: classification, Actions: "" },
          });
        }
      }

      return data;
    };

    table.loadData(true);
  };

  return BUI.html`
    <bim-table ${BUI.ref(onCreated)}></bim-table>
  `;
};

const [groupsTable, updateTable] = BUI.Component.create<
  BUI.Table<GroupsTableData>,
  GroupsTableState
>(groupsTableTemplate, {
  components,
});
/*
maxHeight -> Limita la altura visual de la tabla
hiddenColumns = ["Classification"] -> Oculta la columna Classification
noIndentation = true -> Evita sangrías visuales
headersHidden = true -> Oculta la cabecera de la tabla
*/
groupsTable.style.maxHeight = "25rem";
groupsTable.hiddenColumns = ["Classification"];
groupsTable.columns = ["Name", { name: "Actions", width: "auto" }];
groupsTable.noIndentation = true;
groupsTable.headersHidden = true;
// Aquí es donde por fin el visor se actualiza dinámicamente. 
// Se está igualando 'groupsTable.dataTransform' a un objeto JavaScript cuyas claves son nombres de columnas y cuyos valores son funciones que transforman el contenido de esa columna.
groupsTable.dataTransform = {
  Actions: (_, rowData) => {
    const { Name, Classification } = rowData;
    if (!(Name && Classification)) return _;
    const classification = classifier.list.get(Classification);
    if (!classification) return _;
    const groupData = classification.get(Name);
    if (!groupData) return _;

    const hider = components.get(OBC.Hider);
    const onClick = async ({ target }: { target: BUI.Button }) => {
      target.loading = true;
      // Devuelve el conjunto real de elementos de ese grupo.
      const modelIdMap = await groupData.get();
      // Oculta todo menos esos elementos.
      await hider.isolate(modelIdMap);
      target.loading = false;
    };

    return BUI.html`<bim-button icon="solar:cursor-bold" @click=${onClick}></bim-button>`;
  },
};
// Cuando el classifier añade nuevas clasificaciones o grupos, la tabla se refresca.
classifier.list.onItemSet.add(() => setTimeout(() => updateTable()));
// Crear el panel principal del tutorial
const panelClassifier = BUI.Component.create<BUI.PanelSection>(() => {
  const onResetVisibility = async ({ target }: { target: BUI.Button }) => {
    target.loading = true;
    const hider = components.get(OBC.Hider);
    await hider.set(true);
    target.loading = false;
  };

  const onAddDefaults = async () => {
    await addDefaultGroupings();
  };

  return BUI.html`
    <bim-panel active label="Classifier Tutorial" class="options-menu">
      <bim-panel-section style="min-width: 14rem" label="General">
        <bim-button label="Reset Visibility" @click=${onResetVisibility}></bim-button>
      </bim-panel-section>
      <bim-panel-section label="Groupings">
        <bim-button label="Add Defaults" @click=${onAddDefaults}></bim-button>
        ${groupsTable}
      </bim-panel-section>
    </bim-panel>
  `;
});




// ----------------------------------------------------------------------------------------
// Using The Raycasters Component
// El lanzamiento de rayos consiste en proyectar un rayo desde un punto a otro en el espacio. 
// Lanzaremos un rayo desde la posición del ratón al mundo 3D y comprobaremos si hay algún objeto en su camino.
const casters = components.get(OBC.Raycasters);
// Here, we retrieve the raycaster for the `world` used in our scene.
const caster = casters.get(world);

// We set a selection callback, so we can decide what
// happen with the selected element later
/*
Variable que contiene una funcion; En Typescript se usa (param) => {}
El {} NO ES UN OBJETO VACIO EN ESTE CASO; ES UNA FUNCION DE CUERPO VACIO (DONDE SE ESPECIFICA LA FUNCION NO HAY NADA)
*/ 
let onSelectCallback = (_modelIdMap: OBC.ModelIdMap) => {};

/*
 Cuando el usuario haga doble click sobre el div viewer, ejecuta esta función.
No ejecuta esto cuando hace doble clic, ese momento del tiempo viene despues
*/
container.addEventListener("dblclick", async () => {
/*
  ¿Qué hace castRay()?
  Hace raycasting.

  ¿Qué es raycasting?
  1º)Obtiene la posición del ratón

  2º)Crea un rayo 3D desde la cámara hacia el mundo

  3º)Calcula intersecciones con los objetos de la escena

  4º)Devuelve el objeto impactado
  Pero ThatOpen te abstrae eso.

 'Result' sera algo como lo siguiente:
 {
  fragments: {
    modelId: "abc123"
  },
  localId: 457
}
modelId → qué modelo IFC es

localId → qué elemento dentro del modelo
 
 */
  const result = (await caster.castRay()) as any;
  //Si no se ha hecho click sobre nada se sale de la funcion
  if (!result) return;
  // The modelIdMap is how selections are represented in the engine.
  // The keys are modelIds, while the values are sets of localIds (items within the model)
  // Si el modelo tiene un muro (IFCWall 123 -> ItemID, otro muro IFCWall 124 -> ItemID) y cada muro se divide en diversas geometrias que son ya los localID.
  const modelIdMap = { [result.fragments.modelId]: new Set([result.localId]) };
  onSelectCallback(modelIdMap);
});

let onItemSelected = () => {};
let attributes: FRAGS.ItemData | undefined;

// We set the color outside just to be able to change it from the UI
const color = new THREE.Color("purple");

onSelectCallback = async (modelIdMap) => {
  const modelId = Object.keys(modelIdMap)[0];
  if (modelId && fragments.list.get(modelId)) {
    const model = fragments.list.get(modelId)!;
    //'...' es para expandir los elementos iterables del Set dentro de un array
    const [data] = await model.getItemsData([...modelIdMap[modelId]]);
    attributes = data;
  }

  await fragments.highlight(
    {
      color,
      renderedFaces: FRAGS.RenderedFaces.ONE,
      opacity: 1,
      transparent: false,
    },
    modelIdMap,
  );

  await fragments.core.update(true);

  onItemSelected();
};


/**^
 *! IMPLEMENTACION DE INTERFAZ GRAFICA PARA SELECCION
 */

const [panel, updatePanel] = BUI.Component.create<BUI.PanelSection, {}>((_) => {
  const onColorChange = ({ target }: { target: BUI.ColorInput }) => {
    color.set(target.color);
  };

  let nameLabel = BUI.html`<bim-label>There is no item name to display.</bim-label>`;
  if (attributes && "value" in attributes.Name) {
    nameLabel = BUI.html`<bim-label>${attributes.Name.value}</bim-label>`;
  }

  const onClearColors = async ({ target }: { target: BUI.Button }) => {
    target.loading = true;
    await fragments.resetHighlight();
    await fragments.core.update(true);
    target.loading = false;
  };

  return BUI.html`
    <bim-panel active label="Raycasters Tutorial" class="options-menu">
      <bim-panel-section label="Controls">
        <bim-label>Double Click: Colorize element</bim-label>
        <bim-color-input @input=${onColorChange} color=#${color.getHexString()}></bim-color-input>
        <bim-button label="Clear Colors" @click=${onClearColors}></bim-button>
      </bim-panel-section>
      <bim-panel-section label="Item Data">
        ${nameLabel}
      </bim-panel-section>
    </bim-panel>
  `;
}, {});

// Cuando seleccionas un elemento vuelve a renderizar el panel con updatePanel()
onItemSelected = () => updatePanel();

const propiedades = document.getElementById("propiedades")!;

propiedades.append(panel);
propiedades.append(panelClassifier);