import { GameController } from "./controller.js";
import { GameModel } from "./model.js";
import { GameView } from "./view.js";

const model = new GameModel();
const view = new GameView();
new GameController(model, view);
