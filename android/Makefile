# Wayli Android — build & test shortcuts.
# `make help` lists everything. Unless noted, targets assume the emulator
# is running (see `make emu` / `make emu-wait`).

# ---- Environment (overridable: `make test JAVA_HOME=/other/jdk`) ----
JAVA_HOME ?= $(HOME)/.local/jdks/jdk-21.0.5+11
ANDROID_HOME ?= $(HOME)/.local/android-sdk
export JAVA_HOME ANDROID_HOME
export PATH := $(JAVA_HOME)/bin:$(ANDROID_HOME)/platform-tools:$(ANDROID_HOME)/emulator:$(PATH)

GRADLE := ./gradlew
ADB := $(ANDROID_HOME)/platform-tools/adb
PKG := io.github.nimbleflux.wayli
ACTIVITY := $(PKG)/.MainActivity
AVD ?= wayli-test

.DEFAULT_GOAL := help

.PHONY: help
help: ## List available targets
	@echo "Wayli Android — make targets:"
	@grep -E '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

# ---- Build & test ----

.PHONY: build
build: ## Build debug APKs (gplay + foss)
	$(GRADLE) :app:assembleGplayDebug :app:assembleFossDebug

.PHONY: build-foss
build-foss: ## Build the foss debug APK
	$(GRADLE) :app:assembleFossDebug

.PHONY: release
release: ## Build unsigned release APKs (signed needs keystore config, see RELEASING.md)
	$(GRADLE) :app:assembleGplayRelease :app:assembleFossRelease

.PHONY: test
test: ## Run all unit tests (25 tests across modules)
	$(GRADLE) test

.PHONY: lint
lint: ## Run detekt
	$(GRADLE) detekt

.PHONY: clean
clean: ## Gradle clean
	$(GRADLE) clean

# ---- Emulator lifecycle ----

.PHONY: emu
emu: ## Start the emulator (background, host GPU)
	@nohup emulator -avd $(AVD) -no-audio -no-boot-anim -gpu host > /tmp/wayli-emulator.log 2>&1 & \
	echo "Emulator starting (log: /tmp/wayli-emulator.log) — run 'make emu-wait' to wait for boot."

.PHONY: emu-wait
emu-wait: ## Wait until the emulator finished booting
	$(ADB) wait-for-device
	@until [ "$$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do sleep 2; done
	@echo "Emulator booted."

.PHONY: emu-kill
emu-kill: ## Stop the emulator
	$(ADB) emu kill || true

.PHONY: devices
devices: ## List connected devices
	$(ADB) devices

# ---- Install & run ----

.PHONY: install
install: ## Install the foss debug APK
	$(GRADLE) :app:installFossDebug

.PHONY: install-gplay
install-gplay: ## Install the gplay debug APK
	$(GRADLE) :app:installGplayDebug

.PHONY: run
run: ## Launch the app
	$(ADB) shell am start -n $(ACTIVITY)

.PHONY: deploy
deploy: install run ## Install + launch (foss debug)

.PHONY: fresh
fresh: ## Reset app data and relaunch (back to the welcome screen)
	$(ADB) shell pm clear $(PKG)
	$(ADB) shell am start -n $(ACTIVITY)

.PHONY: demo
demo: ## Reset, launch, and enter demo mode via the Try Demo button
	$(ADB) shell pm clear $(PKG)
	$(ADB) shell am start -n $(ACTIVITY)
	@sleep 4; adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; \
	y=$$(adb shell cat /sdcard/ui.xml | tr '>' '\n' | grep '"Try Demo"' | grep -oE ',[0-9]+\]\[' | head -1 | grep -oE '[0-9]+' | head -1); \
	if [ -n "$$y" ]; then adb shell input tap 540 $$((y + 15)); echo "Tapped Try Demo."; else echo "'Try Demo' button not found — app may have skipped the welcome screen."; fi

# ---- Debugging & testing on the emulator ----

.PHONY: logs
logs: ## Stream logcat filtered to Wayli + the upload worker
	$(ADB) logcat -v time | grep --line-buffered -iE "wayli|GpsUploadWorker|TrackingService|AndroidRuntime"

.PHONY: crash
crash: ## Show recent crashes (if any)
	-$(ADB) logcat -d -t 500 | grep -E "FATAL EXCEPTION|AndroidRuntime" | tail -30

.PHONY: screenshot
screenshot: ## Capture a screenshot → FILE=/tmp/wayli.png
	$(ADB) shell screencap -p /sdcard/wayli-shot.png
	$(ADB) pull /sdcard/wayli-shot.png $(FILE)
	@echo "Saved $(FILE)"

FILE ?= /tmp/wayli.png

.PHONY: uidump
uidump: ## Dump the UI hierarchy (text + bounds) for tap-coordinate testing
	$(ADB) shell uiautomator dump /sdcard/ui.xml
	@adb shell cat /sdcard/ui.xml | tr '>' '\n' | grep -oE 'text="[^"]+"|bounds="[^"]+"' | paste - -

# ---- GPS injection (emulator) ----

LON ?= 5.1214
LAT ?= 52.0907
STEPS ?= 8

.PHONY: geo
geo: ## Inject one GPS fix: make geo LON=5.1214 LAT=52.0907
	$(ADB) emu geo fix $(LON) $(LAT)
	@echo "Fix: $(LAT), $(LON)"

.PHONY: walk
walk: ## Inject a walking route: make walk [LON=5.12] [LAT=52.09] [STEPS=8]
	@lon=$(LON); lat=$(LAT); \
	for i in $$(seq 0 $(STEPS)); do \
		adb emu geo fix $$lon $$lat; \
		echo "step $$i: $$lat, $$lon"; \
		lon=$$(awk "BEGIN{print $$lon+0.0015}"); \
		lat=$$(awk "BEGIN{print $$lat+0.0008}"); \
		sleep 6; \
	done
	@echo "Done — check History/Stats or tracker_data on the server."
