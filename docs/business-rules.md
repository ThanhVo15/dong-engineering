# Business Rules

This document is extracted from the old repo and user-provided UI mapping screenshots. It is the source for the new parser/cache/save implementation.

## Source Folders

- `Chronos/P_Chronos`: primary project files. A project is defined from P files, not from the union of P/AC2/T job numbers.
- `AC2`: code/task/payment/detail files grouped by job number.
- `Chronos/T_Chronos`: timesheet rows grouped by job number.

## P_Chronos

Filename format:

```text
F0~F1~F2~F3~F4.txt
```

Content format:

```text
C0|C1|C2|C3|C4|C5|C6|C7|C8|C9|C10|C11
```

Current mapping:

| UI field | Source |
|---|---|
| P1 Job Number | F0 |
| P2 | Not used |
| P3 Job Name | C0 |
| P4 Job Location | C1 |
| P5 Project Notes | C7 |
| P6 Status | F1 |
| P7 Estimate | C9 |
| P8 Architect | C2 |
| P9 Customer | C3 |
| P10 Start Date | C4; F2 is the matching filename Excel serial |
| P11 End Date | C5; F3 is the matching filename Excel serial |
| P12 Type | C6 |
| P13 Assignee | cleaned F4 |

Notes:

- F4 may include `@`; UI shows the cleaned name.
- C8 may duplicate status in content, but screenshot mapping uses F1 for P6. New UI must treat F1 as the display/save source for status.
- C4/F2 and C5/F3 should represent the same dates. Save must update both sides when date fields change.
- P content may include multiline text.
- Old parser recognizes embedded lines starting with `TASK|`, `TIME|`, `SUM|`.
- Save can update content fields and filename fields. Filename fields include status, start date, end date, assignee.

## AC2

Filename format can be either:

```text
S0~S1~S2~S3~S4~S5~S6~S7.txt
S0~S1~S2~S3~S4~S5;S6~S7.txt
```

Current mapping:

| Parsed field | Source |
|---|---|
| jobNo | S0 job token, fallback from S5 if S0 has no job |
| code | S1 |
| status | S2 |
| dateSerial | S3 |
| dateString | Excel serial S3 |
| payment | S4 |
| account | S5 |
| sent | S6 |
| contact | S7 |

AC2 content rule:

- Description is normally content field index 3.
- Planned hours is normally content field index 5.
- Old parser has tolerant fallback for missing description/planned hours.

P14 table:

| UI P14 column | Source |
|---|---|
| 0 | S1 code |
| 1 | S2 status |
| 2 | S3 date |
| 3 | S4 payment |
| 4 | S6 sent |
| 5 | S5 account |
| 6 | planned/actual detail: 6-1 from AC2 content field 5, 6-2 from sum of matching T rows |

For P14 column 6:

- 6-1 opens the AC2 file and reads planned hours from content field index 5.
- 6-2 sums `T5` from `Chronos/T_Chronos` rows where `T7` without `.txt` equals `S1`.
- Display should keep both values, normally as `plannedDisplay | actualDisplay`.

## T_Chronos

Filename format:

```text
T0~T1~T2~T3~T4~T5~T6~T7.txt
```

Current mapping:

| Parsed field | Source |
|---|---|
| jobNo | T0 |
| plan | T1 |
| account | T2 |
| task | T3 |
| dateSerial | T4 |
| dateString | Excel serial T4 |
| hours | T5 |
| code | T7 tail code, fallback T6 |

P15/P16:

- P15 groups time rows by task (`T3`), optionally filtered by selected code.
- P15 sums `T5` hours.
- P15 last day is the max `T4` serial in the group.
- P16 is the sum of currently visible P15 hours.

## P14/P15 Interaction

- Opening a project shows all P14 codes and all P15 time summary rows.
- Clicking a P14 item filters P15 to that code.
- P17 refresh returns P14/P15 to the original all-code view.
- P18 displays code descriptions from AC2 as `+ Code {S1} ({content field 5}h)->{content field 3}`.

## Save Rules

- Save writes Dropbox source txt first, never cache first.
- Source upload requires Dropbox rev conflict protection.
- Safe rename requires same source root, same folder, `.txt`, same six-digit job number, and absent destination.
- If source write/rename fails, keep dirty state and do not update cache.
- After source success, recompute affected job cache and update project index.

## Cache Rules

Target cache:

```text
__db__/
  meta.json
  projects.json
  jobs/<projectId>.json
```

`projectId` should normally equal `jobNo`. If duplicate P files share one job number, preserve all P projects with a stable suffix such as `jobNo@@safeFilename`.

## Sync Rules

- Full rebuild scans all source files and initializes cursor.
- Incremental sync uses cursor changes; no full scan every five minutes.
- Only update cursor after all affected cache writes succeed.
- Cursor reset means full rebuild required.
