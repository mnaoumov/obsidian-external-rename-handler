export class PluginSettings {
  /* eslint-disable no-magic-numbers -- Magic numbers are OK in settings. */
  public deletionRenameDetectionTimeoutInMilliseconds = 500;
  public isAdvancedRenameAndDeleteHandlerSuggestionDeclined = false;
  public pollingIntervalInMilliseconds = 2000;

  // The legacy `shouldUpdateLinks` value, waiting to be offered to Advanced Rename and Delete Handler as
  // its `shouldHandleRenames`. Non-`null` means an offer is still pending; `null` means there is nothing to
  // offer, which is also what a fresh install has. One property rather than a flag plus a value, so a fresh
  // install can never be told it has a migration waiting.
  public proposedShouldHandleRenames: boolean | null = null;
  /* eslint-enable no-magic-numbers -- Magic numbers are OK in settings. */
}
