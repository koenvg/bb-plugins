import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { mountStyles } from "./styles-lifecycle.js";
import "./app.css";

export default definePluginApp(app => {
  app.contentScripts.register({ id: "chat-styles", mount: mountStyles });
});
