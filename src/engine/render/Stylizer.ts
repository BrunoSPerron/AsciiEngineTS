export class Stylizer {
    
    styles = {
        "default": { dark: "#222", light: "#bbb" },
        "cool_kid": { dark: "#0A174E", light: "#F5D042" },
        "copper_caves": { dark: "#2D2926", light: "#ed6f63" },
        "dark_sea": { dark: "#00203F", light: "#ADEFD1" },
        "dark_space": { dark: "#331B3F", light: "#ACC7B4" },
        "parchment": { dark: "#A07855", light: "#D4B996" },
        "retro_gold": { dark: "#36341d", light: "#DAA03D" },
        "white_forest": { dark: "#2BAE66", light: "#FCF6F5" },
    }

    setStyleOn(element: HTMLElement, key: string, reversed: boolean = false) {
        if (!(key in this.styles)) {
            key = "default";
            console.warn(`Failed to set style "${key}" on element "${element.id}"`);
        }
        const bgColor = reversed ? this.styles[key]["light"]: this.styles[key]["dark"];
        const textColor = reversed ? this.styles[key]["dark"]: this.styles[key]["light"];
        element.style.setProperty("background-color", bgColor)
        element.style.setProperty("color", textColor)
    }
}
