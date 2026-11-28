import { useComposer } from "@get-bb/plugin-sdk/app";
import type { loadPluginApp } from "@get-bb/plugin-sdk/testing/app";
import { createElement, Fragment } from "react";
import { requireFixtureValue } from "../require-fixture-value.test-support.js";

export function prSummarySlot(app: Awaited<ReturnType<typeof loadPluginApp>>) {
  const segment = requireFixtureValue(
    app.threadContextSegments.find(({ id }) => id === "pr-insight"),
  );
  const useVisible = requireFixtureValue(segment.useVisible);
  const customization = requireFixtureValue(
    app.composerCustomizations.find(({ id }) => id === "pr-insight"),
  );
  const controller = requireFixtureValue(
    customization.banners?.find(({ id }) => id === "pr-controller"),
  );

  const Summary = ({ threadId }: { threadId: string }) => {
    const props = {
      threadId,
      projectId: "proj_1",
      environment: { id: "env_1" },
      segments: [],
      isExpanded: false,
      onToggle() {},
    };
    return useVisible(props) ? createElement(segment.summary, props) : null;
  };
  const ComposerFixture = () => {
    const { scope } = useComposer();
    return scope.kind === "thread"
      ? createElement(
          Fragment,
          null,
          createElement(controller.component),
          createElement(Summary, { threadId: scope.threadId }),
        )
      : null;
  };
  return { component: ComposerFixture };
}
