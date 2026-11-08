# CHANGELOG

## 4.1.1

This release has 1 fix and 2 documentation changes.

### Fixed

- see new files on FAT32 and exFAT drives under Windows with polling on

### Documentation

- link to the Obsidian resources page
- **demo-vault:** add the measured FAT32 and exFAT rows for Windows

## 4.1.0

This release has 3 new features, 3 fixes and 7 documentation changes. 6 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### New

- add a Report a bug command
- persist inode observations in device-local records
- detect renames made while Obsidian was closed

### Fixed

- notice a note a save replaced while Obsidian was closed
- tell a reused inode from a live rename by its birth time
- keep recognizing renames of a note after a save that replaced it

### Documentation

- **readme:** point bug reports at the Report a bug command
- add issue-filing instructions for AI agents
- **readme:** combine related resources and plugin comparisons
- cut the README down to a landing page
- add a Similar plugins section to the README
- measure the rename missed straight after a save that replaced the note
- document which file systems rename detection works on

## 4.0.5

This release has 2 fixes and 5 documentation changes. 5 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- drop the plugin name from notice text
- **demo-vault:** load the demo setup helpers from @mnaoumov/obsidian-lib

### Documentation

- say where chokidar 6 hands add a bigint inode
- name `obsidian-lib` where comments said dev-utils
- shorten the debugging section
- **readme:** lead the Debugging section with `Advanced Debug Mode`
- mark plugin names as code

## 4.0.4

This release has 2 fixes. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- **watcher:** merge handling decomposed-Unicode file names
- **plugin:** merge marking the plugin names in the suggestion reason as code

## 4.0.3

This release has 1 documentation change. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Documentation

- mark plugin names as code in markdown and comments

## 4.0.2

This release has 5 fixes and 4 documentation changes. 12 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- **test:** merge the headless demo-vault toolkit install
- **deps:** restore the lockfile's missing resolved and integrity fields
- tie the path-ino store to a lifetime, and stop losing its queued writes
- **deps:** float devalue to 5.9.4, clearing GHSA-9rgm-9g3h-6x36
- **deps:** override smol-toml to clear a denial-of-service advisory

### Documentation

- **contributing:** base PRs on main, the branch this repo actually has
- drop the rule-id citations from the pin table
- **changelog:** name `obsidian-dev-utils` by its package name
- replace the private tracker references with what they pointed at

## 4.0.1

This release has 1 fix and 2 documentation changes. 5 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- **deps:** move onto `obsidian-dev-utils` 101, and stop replacing the plugin registry

### Documentation

- say where the debug command is run
- name the unversioned demo-vault asset and the folder it unzips into

## 4.0.0

This release has 1 breaking change and 1 fix.

### Breaking changes

- hand rename and delete handling to `Advanced Rename and Delete Handler`

### Fixed

- **build:** wire build:compile to buildCompile and drop the duplicate leaf script

## 3.1.6

This release has 2 fixes and 1 documentation change. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

### Fixed

- **deps:** move to `obsidian-integration-testing` 11 and `obsidian-dev-utils` 96.5.2
- **deps:** drop the brace-expansion file: override that breaks a clean install

### Documentation

- point plugin-directory links at community.obsidian.md

## 3.1.5

This release has 1 fix and 4 documentation changes. 6 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- override deepmerge-ts to clear GHSA-ggr8-5vv4-36mx

### Documentation

- **demo-vault:** unwrap the notes so Obsidian stops rendering a break per line
- **readme:** render the same in Obsidian's plugin page as on `GitHub`
- **demo-vault:** give the demo vault its code buttons
- capture the community-store screenshot set

## 3.1.4

This release has 1 new feature and 1 documentation change.

### New

- **demo-vault:** migrate to `obsidian-dev-utils` 93.3.1 and adopt the authoring convention

### Documentation

- make the demo vault the documentation, in the standard layout

## 3.1.3

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 3.1.2

This release has 1 fix.

### Fixed

- \[BUG\] 3.1.1: all external file changes stop reaching the UI, not just renames (#7)

## 3.1.1

This release has maintenance changes only. 3 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

## 3.1.0

This release has 1 documentation change. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Documentation

- fix the demo vault download instructions

## 3.0.51

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 3.0.50

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 3.0.49

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 3.0.48

This release has 1 fix. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- **demo-vault:** export invoke() from startup script; add Invocables folder

## 3.0.47

This release has 5 documentation changes. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

### Documentation

- standardize demo-vault README
- drop per-plugin demo-vault setup notes (bootstrap covered by the `obsidian-dev-utils` harness)
- **demo-vault:** create the `External Rename Handler` demo vault
- update
- migrate to AGENTS.md

## 3.0.46

This release has maintenance changes only. 8 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

## 3.0.45

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 3.0.44

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 3.0.43

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 3.0.42

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 3.0.41

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 3.0.40

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 3.0.39

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 3.0.38

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 3.0.37

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 3.0.36

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 3.0.35

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 3.0.34

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 3.0.33

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 3.0.32

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 3.0.31

This release has maintenance changes only. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

## 3.0.30

This release has 1 fix. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

### Fixed

- build

## 3.0.29

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 3.0.28

- Minor changes

## 3.0.27

- Minor changes

## 3.0.26

- Minor changes

## 3.0.25

- Minor changes

## 3.0.24

- Minor changes

## 3.0.23

- Minor changes

## 3.0.22

- Minor changes

## 3.0.21

- Minor changes

## 3.0.20

- Minor changes

## 3.0.19

- Minor changes

## 3.0.18

- Minor changes

## 3.0.17

- Minor changes

## 3.0.16

- Minor changes

## 3.0.15

- Minor changes

## 3.0.14

- Minor changes

## 3.0.13

- Minor changes

## 3.0.12

- Minor changes

## 3.0.11

- Minor changes

## 3.0.10

- Minor changes

## 3.0.9

- Minor changes

## 3.0.8

- Minor changes

## 3.0.7

- Minor changes

## 3.0.6

This release has 1 other change.

### Other changes

- window.setTimeout

## 3.0.5

This release has 1 other change.

### Other changes

- Fix build

## 3.0.4

- Minor changes

## 3.0.3

- Minor changes

## 3.0.2

- Minor changes

## 3.0.1

- Minor changes

## 3.0.0

This release has 1 other change.

### Other changes

- Store cached data in IndexedDB

## 2.6.7

- Minor changes

## 2.6.6

- Improve performance

## 2.6.5

- Minor changes

## 2.6.4

- Minor changes

## 2.6.3

- Minor changes

## 2.6.2

- Minor changes

## 2.6.1

This release has 1 other change.

### Other changes

- New template

## 2.6.0

This release has 1 other change.

### Other changes

- Add progress bar

## 2.5.0

This release has 3 other changes.

### Other changes

- Extract `deletionRenameDetectionTimeoutInMilliseconds`
- More accurate check for deletion
- Improve rename detection

## 2.4.0

This release has 2 other changes.

### Other changes

- Prefilter dotFiles
- Make polling configurable

## 2.3.0

This release has 1 other change.

### Other changes

- Make polling configurable

## 2.2.0

This release has 1 other change.

### Other changes

- Do initial load before watcher

## 2.1.0

This release has 1 other change.

### Other changes

- Switch to chokidar

## 2.0.1

- Minor changes

## 2.0.0

- Switch to more reliable watcher

## 1.1.11

This release has 2 other changes.

### Other changes

- Refactor complexity
- GenericFileSystemWatchHandler

## 1.1.10

- Minor changes

## 1.1.9

This release has 2 other changes.

### Other changes

- Update libs, fix audit
- Handle non-root renames

## 1.1.8

- Minor changes

## 1.1.7

This release has 1 other change.

### Other changes

- Update template

## 1.1.6

This release has 1 other change.

### Other changes

- Lint

## 1.1.5

This release has 1 other change.

### Other changes

- Format

## 1.1.4

- Minor changes

## 1.1.3

- Minor changes

## 1.1.2

- Minor changes

## 1.1.1

This release has 1 other change.

### Other changes

- Add funding

## 1.1.0

This release has 1 other change.

### Other changes

- Add `Should update links` setting

## 1.0.3

- Minor changes

## 1.0.2

This release has 1 other change.

### Other changes

- Add check for FileSystemAdapter

## 1.0.1

This release has 1 other change.

### Other changes

- Remove Obsidian from description

## 1.0.0

- Initial version
