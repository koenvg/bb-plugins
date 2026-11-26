// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { act, cleanup } from "@testing-library/react";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { useLiveRpc } from "./live-rpc";

afterEach(cleanup);
const deferred = <T,>() => {
  const { promise, resolve, reject } = Promise.withResolvers<T>();
  return { promise, resolve, reject };
};

it("distinguishes loading and failed loads from successful empty results and recovers", async () => {
  let request = deferred<Record<string, number>>();
  const read = () => request.promise;
  const Probe = () => {
    const [value, , status] = useLiveRpc("changed", read);
    return (
      <output>
        {status}:{value === null ? "unanswered" : JSON.stringify(value)}
      </output>
    );
  };
  const slot = renderSlot({ component: Probe }, {});
  expect(slot.getByText("loading:unanswered")).toBeTruthy();
  await act(() => Promise.try(() => request.reject(new Error("offline"))));
  expect(slot.getByText("error:unanswered")).toBeTruthy();
  request = deferred();
  await slot.behavior.emitRealtime("changed", {});
  expect(slot.getByText("loading:unanswered")).toBeTruthy();
  await act(() => Promise.try(() => request.resolve({})));
  expect(slot.getByText("ready:{}")).toBeTruthy();
  request = deferred();
  await slot.behavior.emitRealtime("changed", {});
  expect(slot.getByText("loading:{}")).toBeTruthy();
  await act(() => Promise.try(() => request.reject(new Error("refresh failed"))));
  expect(slot.getByText("error:{}")).toBeTruthy();
  request = deferred();
  await slot.behavior.setRealtimeConnectionState("reconnecting");
  expect(slot.getByText("loading:{}")).toBeTruthy();
  await slot.behavior.setRealtimeConnectionState("connected");
  expect(slot.getByText("loading:{}")).toBeTruthy();
  await act(() => Promise.try(() => request.resolve({})));
  expect(slot.getByText("ready:{}")).toBeTruthy();
});
