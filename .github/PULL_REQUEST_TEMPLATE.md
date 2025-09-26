### Related Issue

<!-- Please use keywords like fixes, closes, resolves, or relates to link issues. In principle, all PRs should have associated issues -->

### Main Changes

<!--
  @example:
    1. Fixed xxx
    2. Improved xxx
    3. Adjusted xxx
-->

### Screenshots

<!-- If the changes are UI-related, whether CLI or Web, screenshots should be included -->

### Test Plan

<!-- If this change is not covered by automated tests, what manual test cases should be performed? Please write as a todo list below -->

### Checklist

- [ ] This change contains breaking changes, and I have written migration scripts for the breaking changes (check if this is not a breaking change)
- [ ] This change requires documentation updates, and I have updated the relevant documentation. If documentation is not yet updated, please create and link a documentation update issue
- [ ] The changed areas already have test coverage, and I have adjusted the test coverage for the changed parts
- [ ] The new code logic added in this change also has test coverage
- [ ] Compatibility testing for this change covers Chrome
- [ ] Compatibility testing for this change covers Safari
- [ ] Compatibility testing for this change covers PC platforms
- [ ] Compatibility testing for this change covers mobile platforms (mobile browsers, in-app browsers)
- [ ] This change includes user input logic, and both backend and frontend have added validation and error messages for user input
- [ ] This change adds APIs that modify backend data, and I have added AuditLog for these APIs
- [ ] This change adds new files, and the corresponding package.json files field includes these new files
- [ ] This change adds dependencies, and they are placed in dependencies and devDependencies
- [ ] This change adds or updates npm dependencies without causing multiple versions of the same dependency (check pnpm-lock.yaml diff)
- [ ] I have upgraded ArcBlock dependencies to the latest version for this change: `pnpm update:deps`
- [ ] (Check before merging to main) Successfully ran pnpm dev, pnpm bundle, pnpm bump-version
