import React from "react";
import { onlineManager } from "@tanstack/react-query";

import { OfflineNotice } from "../OfflineNotice";

const { create, act } = require("react-test-renderer");
const text = (renderer: ReturnType<typeof create>) => JSON.stringify(renderer.toJSON());

afterEach(() => { onlineManager.setOnline(true); });

describe("aviso amarillo de «necesita internet»", () => {
  it("con conexión no se muestra", async () => {
    onlineManager.setOnline(true);
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(React.createElement(OfflineNotice, { message: "Esto necesita internet" })); });
    expect(renderer.toJSON()).toBeNull();
  });

  it("sin conexión se muestra, y desaparece solo al volver la conexión", async () => {
    onlineManager.setOnline(false);
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(React.createElement(OfflineNotice, { message: "Esto necesita internet" })); });
    expect(text(renderer)).toContain("Sin internet");
    expect(text(renderer)).toContain("Esto necesita internet");
    await act(async () => { onlineManager.setOnline(true); });
    expect(renderer.toJSON()).toBeNull();
  });

  it("solo aparece cuando aplica a lo que se está haciendo (when)", async () => {
    onlineManager.setOnline(false);
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(React.createElement(OfflineNotice, { when: false, message: "No aplica" })); });
    expect(renderer.toJSON()).toBeNull();
    await act(async () => { renderer.update(React.createElement(OfflineNotice, { when: true, message: "Sí aplica" })); });
    expect(text(renderer)).toContain("Sí aplica");
  });
});
