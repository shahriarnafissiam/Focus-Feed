let cleanFeedMode = true;
let hideStories = true;
let focusEndTime = 0;

function isFocusActive() {
  return typeof focusEndTime === "number" && focusEndTime > Date.now();
}

function syncSettings(data) {
  if (typeof data.cleanFeedMode === "boolean") cleanFeedMode = data.cleanFeedMode;
  if (typeof data.hideStories === "boolean") hideStories = data.hideStories;
  if (typeof data.focusEndTime === "number") focusEndTime = data.focusEndTime;
  applyAllRules();
}

chrome.storage.local.get(
  {
    cleanFeedMode: true,
    hideStories: true,
    focusEndTime: 0
  },
  (data) => {
    syncSettings(data);
  }
);

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;

  if (changes.cleanFeedMode) cleanFeedMode = Boolean(changes.cleanFeedMode.newValue);
  if (changes.hideStories) hideStories = Boolean(changes.hideStories.newValue);
  if (changes.focusEndTime) focusEndTime = Number(changes.focusEndTime.newValue) || 0;

  applyAllRules();
});

function blockReelsURL() {
  if (window.location.pathname.includes("/reel")) {
    window.location.replace("https://www.facebook.com/");
  }
}

function applyStoriesMode() {
  const shouldHideStories = hideStories || isFocusActive();
  const displayVal = shouldHideStories ? "none" : "";

  document.querySelectorAll('div[aria-label="Stories"]').forEach(el => {
    el.style.display = displayVal;
  });

  document.querySelectorAll('a[href*="/stories/create"]').forEach(link => {
    const tray =
      link.closest('div[aria-label="Stories"]') ||
      link.closest('div[role="region"]') ||
      link.parentElement?.parentElement?.parentElement?.parentElement;

    if (tray) {
      tray.style.display = displayVal;
    }
  });
}

function applyCleanFeedMode() {
  const shouldCleanFeed = cleanFeedMode || isFocusActive();
  const displayVal = shouldCleanFeed ? "none" : "";

  document.querySelectorAll('div[role="feed"]').forEach(feed => {
    feed.style.display = displayVal;
  });
}

function applyAllRules() {
  blockReelsURL();
  applyStoriesMode();
  applyCleanFeedMode();
}

const observer = new MutationObserver(() => {
  applyAllRules();
});

observer.observe(document.body, { childList: true, subtree: true });
