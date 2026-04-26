import { Engine } from "./engine/core/Engine"
import "./style.css"

const root = document.querySelector<HTMLDivElement>("#app")!

const engine = new Engine(root)
engine.start()
