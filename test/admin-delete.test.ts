import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { runInNewContext } from "node:vm";

const script = await readFile(
  new URL("../public/js/admin-delete.js", import.meta.url),
  "utf8"
);

function harness(supported = true) {
  const triggerEvents: Record<string, () => void> = {};
  const cancelEvents: Record<string, () => void> = {};
  const formEvents: Record<string, (event: { preventDefault: () => void }) => void> = {};
  const confirm = { disabled: false, textContent: "delete" };
  let modalCalls = 0;
  let closes = 0;

  const dialog = {
    open: false,
    showModal: supported ? () => {
      modalCalls += 1;
      dialog.open = true;
    } : undefined,
    close() {
      closes += 1;
      dialog.open = false;
    },
    querySelector(selector: string) {
      if (selector === "form") {
        return { addEventListener: (name: string, callback: typeof formEvents[string]) => { formEvents[name] = callback; } };
      }
      if (selector === "[data-cancel-delete]") {
        return { addEventListener: (name: string, callback: () => void) => { cancelEvents[name] = callback; } };
      }
      return confirm;
    }
  };

  const trigger = {
    hidden: true,
    dataset: { deleteDialog: "delete-post-1" },
    addEventListener(name: string, callback: () => void) {
      triggerEvents[name] = callback;
    }
  };

  runInNewContext(script, {
    document: {
      querySelectorAll: () => [trigger],
      getElementById(id: string) {
        assert.equal(id, "delete-post-1");
        return dialog;
      }
    }
  });

  function submit() {
    let prevented = false;
    formEvents.submit({ preventDefault() { prevented = true; } });
    return prevented;
  }

  return {
    trigger, dialog, confirm, submit,
    open: () => triggerEvents.click(),
    cancel: () => cancelEvents.click(),
    modalCalls: () => modalCalls,
    closes: () => closes
  };
}

describe("dashboard delete modal interactions", () => {
  it("opens the dialog without submitting a deletion", () => {
    const h = harness();
    assert.equal(h.trigger.hidden, false);
    h.open();
    assert.equal(h.dialog.open, true);
    assert.equal(h.modalCalls(), 1);
    assert.equal(h.confirm.disabled, false);
    h.open();
    assert.equal(h.modalCalls(), 1);
  });

  it("cancels without submitting and can reopen", () => {
    const h = harness();
    h.open();
    h.cancel();
    assert.equal(h.dialog.open, false);
    assert.equal(h.closes(), 1);
    assert.equal(h.confirm.disabled, false);
    h.open();
    assert.equal(h.dialog.open, true);
  });

  it("blocks submission while the dialog is closed", () => {
    const h = harness();
    assert.equal(h.submit(), true);
    assert.equal(h.confirm.disabled, false);
  });

  it("allows confirmation once and prevents duplicate submissions", () => {
    const h = harness();
    h.open();
    assert.equal(h.submit(), false);
    assert.equal(h.confirm.disabled, true);
    assert.equal(h.confirm.textContent, "deleting…");
    assert.equal(h.submit(), true);
  });

  it("keeps delete controls hidden when modal dialogs are unsupported", () => {
    const h = harness(false);
    assert.equal(h.trigger.hidden, true);
  });
});
