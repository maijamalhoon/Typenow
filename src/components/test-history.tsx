"use client";

import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import { PRODUCT_NAME } from "@/lib/brand";
import {
  exportTestHistory,
  importTestHistory,
  readTestHistory,
  type TestHistoryEntry,
} from "@/lib/history";
import { Button } from "./ui";

export function TestHistory() {
  const [records, setRecords] = useState<TestHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    readTestHistory()
      .then((history) => {
        if (mounted) setRecords(history);
      })
      .catch((cause: unknown) => {
        if (mounted) setError(getErrorMessage(cause));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  async function handleExport() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const data = await exportTestHistory();
      const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${PRODUCT_NAME.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-history.json`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setMessage("History exported as JSON.");
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const importedCount = await importTestHistory(await file.text());
      setRecords(await readTestHistory());
      setMessage(`${importedCount} test record${importedCount === 1 ? "" : "s"} imported or updated.`);
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      input.value = "";
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="history-heading" className="history-page">
      <div className="history-heading">
        <div>
          <span className="eyebrow">Stored on this device</span>
          <h1 id="history-heading">Test history</h1>
        </div>
        <div className="history-actions">
          <Button disabled={busy || loading} onClick={handleExport} variant="secondary">
            Export JSON
          </Button>
          <label className="button button--secondary history-import">
            Import JSON
            <input
              accept="application/json,.json"
              disabled={busy}
              onChange={handleImport}
              type="file"
            />
          </label>
        </div>
      </div>
      {error && <p className="history-error" role="alert">{error}</p>}
      {message && <p aria-live="polite" className="history-message" role="status">{message}</p>}
      {loading ? (
        <p aria-live="polite">Loading local history...</p>
      ) : records.length === 0 ? (
        <p className="history-empty">No saved tests yet.</p>
      ) : (
        <div className="history-table-wrap">
          <table className="history-table">
            <thead>
              <tr>
                <th scope="col">Completed</th>
                <th scope="col">Test</th>
                <th scope="col">Net WPM</th>
                <th scope="col">Accuracy</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id}>
                  <td>{new Date(record.completedAt).toLocaleString()}</td>
                  <td>{record.mode === "timed" ? `${record.modeValue} seconds` : `${record.modeValue} words`}</td>
                  <td>{record.metrics.netWpm.toFixed(1)}</td>
                  <td>{record.metrics.accuracy.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="history-footnote">Backups merge by record ID; existing local tests are kept.</p>
    </section>
  );
}

function getErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Unable to access local test history.";
}
