# Contextual project icon editor

The editor uses SDK 0.6.104 declarations, upgraded from 0.6.49 to match the running host. The homepageSection projectId prop and experimental_threadAction target projectId are authoritative. Menu and header registrations open the same experimental_appOverlay-owned native modal dialog. No thread context lookup or Settings navigation is involved.

The existing Settings editor and contextual editor share the same picker, preview, removal/Undo controls and state implementation. Contextual list results are restricted to the requested ID, including after realtime refresh; a missing project cannot fall back to another project. Closing unmounts the draft and cancels its state lifetime. Already submitted RPCs may finish. Escape closes the modal; nested PNG preview Escape closes only that preview. Native dialog behavior owns modality and Tab focus containment. Connected opening elements receive focus on close; menu items removed by the host cannot receive focus, so host menu focus restoration still requires live verification.

Header actions fold into the thread menu at compact widths per SDK declarations. The plugin does not replace sidebar or folder surfaces.

## Verification boundary

Local npm run check passes (197 tests). Live verification remains blocked: Browser Automation reports no win32-x64 runtime, and Computer Use reports an unavailable native pipe. No live claim is made for Threads integration, split panes, keyboard/focus restoration, cancel, repeated opens, reload, or Simple Sidebar Folders preservation. These are acceptance gates before integration. The installed plugin was left unchanged.
