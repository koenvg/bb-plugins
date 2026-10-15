# Codex usage collection

Codex usage collection records host-local usage separately from account quota and activity.

## Language

**Collector**:
The opt-in Pi extension that records Codex usage on its owning host.
_Avoid_: quota reader, transcript importer

**Collector maintenance**:
A readiness check or an existing-collector repair for one explicitly authorized host, independent of dashboard selection. Existing-collector repair excludes installation of a missing collector.
_Avoid_: automatic installation, host enrollment

**Host selection**:
The host currently chosen for the Codex Quota dashboard and its manual controls. Selection does not grant authorization for collector maintenance.
_Avoid_: host approval
