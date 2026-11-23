export enum PollingMode {
  // Polling everywhere the volume's folder times allow it, local disks included.
  Always = 'always',
  // Polling only where the native watcher reports nothing, such as a network share or `\\wsl.localhost`.
  Auto = 'auto',
  // The native watcher only.
  Never = 'never'
}

export class PluginSettings {
  /* eslint-disable no-magic-numbers -- Magic numbers are OK in settings. */
  public deletionRenameDetectionTimeoutInMilliseconds = 500;
  public isAdvancedRenameAndDeleteHandlerSuggestionDeclined = false;
  public pollingIntervalInMilliseconds = 2000;
  public pollingMode = PollingMode.Auto;

  // The legacy `shouldUpdateLinks` value, waiting to be offered to `Advanced Rename and Delete Handler` as
  // its `shouldHandleRenames`. Non-`null` means an offer is still pending; `null` means there is nothing to
  // offer, which is also what a fresh install has. One property rather than a flag plus a value, so a fresh
  // install can never be told it has a migration waiting.
  public proposedShouldHandleRenames: boolean | null = null;

  public shouldDetectOfflineRenames = true;
  /* eslint-enable no-magic-numbers -- Magic numbers are OK in settings. */
}
