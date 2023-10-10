/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

// Window edge action
const WindowEdgeAction = {
    NONE: 0,                // No action
    WAIT_GESTURE: 0x01,     // Wait for gesture flag
    MOVE: 0x02,             // Move flag
    RESIZE: 0x04,           // Resize flag

    GESTURE_LEFT: 0x10,     // Gesture Left
    GESTURE_RIGHT: 0x20,    // Gesture Right
    GESTURE_UP: 0x40,       // Gesture Up
    GESTURE_DOWN: 0x80,     // Gesture Down

    GESTURE_UP_LEFT: 0x100, // Gesture Up Left
    GESTURE_UP_RIGHT: 0x200,// Gesture Up Right

    GESTURE_HORIZONTAL: 0x400, // Non-Window Gestures
    GESTURE_VERTICAL: 0x800,

    RESIZE_LEFT: 0x1000,
    RESIZE_RIGHT: 0x2000,
    RESIZE_TOP: 0x4000,
    RESIZE_BOTTOM: 0x8000,

    MOVE_SNAP_TOP: 0x10000,
    MOVE_SNAP_LEFT: 0x20000,
    MOVE_SNAP_RIGHT: 0x40000

};

// Manager Class
class Manager {
    // Init Extension
    constructor(ext) {
        // Get settings
        this._settings = ext.getSettings();

        // Create virtual devices
        const seat = Clutter.get_default_backend().get_default_seat();
        this._virtualTouchpad = seat.create_virtual_device(
            Clutter.InputDeviceType.POINTER_DEVICE
        );
        this._virtualKeyboard = seat.create_virtual_device(
            Clutter.InputDeviceType.KEYBOARD_DEVICE
        );

        // Init variables - keep enable() clean
        this._clearVars();

        // Capture Touchpad Event
        this._gestureCallbackID = global.stage.connect(
            'captured-event::touchpad',
            this._touchEvent.bind(this)
        );

        // init 3 or 4 fingers config support
        this._initFingerCountFlip();
    }

    // Cleanup Extension
    destroy() {
        // restore default GNOME 3 fingers gesture
        this._restoreFingerCountFlip();

        // Release Touchpad Event Capture
        global.stage.disconnect(this._gestureCallbackID);

        // Cleanup virtual devices
        this._virtualTouchpad = null;
        this._virtualKeyboard = null;

        // Cleanup all variables
        this._clearVars();
        this._settings = null;
    }

    // Init 3 or 4 finger count switch mode
    _initFingerCountFlip() {
        // Don't mess with system gesture handlers
        if (this._settings.get_boolean("no-count-flip")) {
            this._swipeMods = [];
            return;
        }

        // Move 3-4 Finger Gesture
        /*
         * Original Hook Logic From (swap-finger-gestures):
         * https://github.com/icedman/swap-finger-gestures-3-4
         * 
         */
        this._swipeMods = [
            Main.overview._swipeTracker._touchpadGesture,
            Main.wm._workspaceAnimation._swipeTracker._touchpadGesture,
            Main.overview._overview._controls
                ._workspacesDisplay._swipeTracker._touchpadGesture,
            Main.overview._overview._controls
                ._appDisplay._swipeTracker._touchpadGesture
        ];
        let me = this;
        this._swipeMods.forEach((g) => {
            g._newHandleEvent = (actor, event) => {
                event._get_touchpad_gesture_finger_count =
                    event.get_touchpad_gesture_finger_count;
                event.get_touchpad_gesture_finger_count = () => {
                    var real_count = event._get_touchpad_gesture_finger_count();
                    if (real_count == me._gestureNumFinger()) {
                        return 0;
                    }
                    else if (real_count >= 3) {
                        /* Default GNOME 3 finger gesture */
                        return 3;
                    }
                    /* Ignore next */
                    return 0;
                };
                return g._handleEvent(actor, event);
            };
            global.stage.disconnectObject(g);
            global.stage.connectObject(
                'captured-event::touchpad',
                g._newHandleEvent.bind(g),
                g
            );
        });
    }

    // Restore 3 or 4 finger count switch mode
    _restoreFingerCountFlip() {
        // Restore 3 finger gesture
        this._swipeMods.forEach((g) => {
            global.stage.disconnectObject(g);
            global.stage.connectObject(
                'captured-event::touchpad',
                g._handleEvent.bind(g),
                g
            );
        });
        this._swipeMods = [];
    }

    // Get padding edge size
    _edgeSize() {
        return this._settings.get_int('edge-size');
    }

    // Get top padding edge size
    _topEdgeSize() {
        return this._settings.get_int('top-edge-size');
    }

    // Get gesture threshold
    _gestureThreshold() {
        return this._settings.get_int('gesture-threshold');
    }

    // Get acceleration
    _getAcceleration() {
        return (this._settings.get_int('gesture-acceleration') * 0.1);
    }

    // Get gesture threshold
    _gestureCancelThreshold() {
        return this._settings.get_int('gesture-cancel-threshold');
    }

    // Get horizontal swipe mode
    _getHorizontalSwipeMode() {
        // false. Change workspace, true. Switch Window
        return this._settings.get_boolean("horiz-swap-switch");
    }

    // Is 3 Finger
    _gestureNumFinger() {
        if (this._settings.get_boolean("no-count-flip"))
            return 4;
        return this._settings.get_boolean("three-finger") ? 3 : 4;
    }

    // Functions Settings
    _getUseActiveWindow() {
        return this._settings.get_boolean("use-active-window");
    }
    _getEnableResize() {
        return this._settings.get_boolean("fn-resize");
    }
    _getEnableMove() {
        return this._settings.get_boolean("fn-move");
    }
    _getEnableMaxSnap() {
        return this._settings.get_boolean("fn-maximized-snap");
    }
    _getEnableMoveSnap() {
        return this._settings.get_boolean("fn-move-snap");
    }

    _getPinchInScale() {
        return this._settings.get_int('pinch-in-scale');
    }

    _getPinchOutScale() {
        return this._settings.get_int('pinch-out-scale');
    }

    _getPinchEnabled() {
        return this._settings.get_boolean("pinch-enable");
    }

    // Check edge flags
    _isEdge(edge) {
        return ((this._edgeAction & edge) == edge);
    }

    // Show Preview
    _showPreview(rx, ry, rw, rh) {
        if (this._targetWindow == null) {
            return;
        }
        global.window_manager.emit("show-tile-preview",
            this._targetWindow, new Meta.Rectangle(
                { x: rx, y: ry, width: rw, height: rh }
            )
            , this._monitorId
        );
    }

    // Hide Preview
    _hidePreview() {
        global.window_manager.emit("hide-tile-preview");
    }

    // Simulate keypress (up -> down)
    _sendKeyPress(combination) {
        combination.forEach(key => this._virtualKeyboard.notify_keyval(
            Clutter.get_current_event_time(), key, Clutter.KeyState.PRESSED)
        );
        combination.reverse().forEach(key =>
            this._virtualKeyboard.notify_keyval(
                Clutter.get_current_event_time(), key, Clutter.KeyState.RELEASED
            ));
    }

    // Move Mouse Pointer
    _movePointer(x, y) {
        if (!this._getUseActiveWindow()) {
            // Move only if not use active window
            this._virtualTouchpad.notify_relative_motion(
                global.get_current_time(), x, y
            );
        }
    }

    // Snap Window
    _setSnapWindow(snapRight) {
        if (this._targetWindow == null) {
            return;
        }
        // TODO: Using non key shortcut for snap left/right
        if (snapRight) {
            this._sendKeyPress([Clutter.KEY_Super_L, Clutter.KEY_Right]);
        }
        else {
            this._sendKeyPress([Clutter.KEY_Super_L, Clutter.KEY_Left]);
        }
    }

    // Move to Workspace
    _moveWindowWorkspace(moveRight) {
        if (this._targetWindow == null) {
            return;
        }
        let tw = this._targetWindow.get_workspace()
            .get_neighbor(moveRight ? Meta.MotionDirection.RIGHT :
                Meta.MotionDirection.LEFT);
        this._targetWindow.change_workspace(tw);
        this._targetWindow.activate(global.get_current_time());
    }

    // Have Left Workspace
    _workspaceHavePrev() {
        if (this._targetWindow == null) {
            return false;
        }
        return (this._targetWindow.get_workspace().index() > 0);
    }

    // Initialize variables
    _clearVars() {
        // Target window to manage
        this._targetWindow = null;

        // Mouse start position
        this._startPos = {
            x: 0, y: 0
        };

        // Mouse start position
        this._movePos = {
            x: 0, y: 0
        };

        // Monitor Id
        this._monitorId = 0;

        // Monitor Workarea
        this._monitorArea = null;

        // Starting Window Area
        this._startWinArea = null;

        // Edge Action
        this._edgeAction = WindowEdgeAction.NONE;
        this._edgeGestured = false;

        // Pinch
        this._pinch = {
            begin: false,
            canceled: false,
            fingers: 0,
            action: 0
        };

        // Clear window tile preview
        this._hidePreview();
    }

    _resetWinPos() {
        if (this._targetWindow == null) {
            return;
        }

        // Reset
        this._targetWindow.move_frame(
            true,
            this._startWinArea.x,
            this._startWinArea.y
        );
    }

    // Activate Target Window
    _activateWindow() {
        if (this._targetWindow == null) {
            return;
        }

        // Activate window if not focused yet
        if (!this._targetWindow.has_focus()) {
            this._targetWindow.activate(
                global.get_current_time()
            );
        }
    }

    // On touch gesture started
    _touchStarted() {
        // Get current mouse position
        let [pointerX, pointerY, pointerZ] = global.get_pointer();

        // Save start position
        this._startPos.x = pointerX;
        this._startPos.y = pointerY;

        // Reset move position
        this._movePos.x = this._movePos.y = 0;

        // Configs
        let allowResize = this._getEnableResize();
        let allowMove = this._getEnableMove();

        if (this._getUseActiveWindow()) {
            // Get Active Window
            this._targetWindow = global.display.get_focus_window();
            if (!this._targetWindow) {
                return Clutter.EVENT_PROPAGATE;
            }
            allowResize = false;
        }
        else {
            // Get actor in current mouse position
            let currActor = global.stage.get_actor_at_pos(
                Clutter.PickMode.REACTIVE, pointerX, pointerY
            );

            // Find root window for current actor
            let currWindow = currActor.get_parent();
            let i = 0;
            while (!currWindow.get_meta_window) {
                currWindow = currWindow.get_parent();
                // Hack for it to works, some apps only 1 level to root window,
                // some apps is multiple parents to root window.
                // loop until got the root (or max 10 level)
                if (!currWindow || (++i > 10)) {
                    // cannot fetch root window, so ignore it!
                    return Clutter.EVENT_PROPAGATE;
                }
            }

            // Set meta window as target window to manage
            this._targetWindow = currWindow.get_meta_window();
        }

        // Set opener window as target if it was dialog
        if (this._targetWindow.is_attached_dialog()) {
            this._targetWindow = this._targetWindow.get_transient_for();
        }

        // Get monitor area
        this._monitorArea = this._targetWindow.get_work_area_current_monitor();

        // Get monitor id
        this._monitorId = global.display.get_monitor_index_for_rect(
            this._monitorArea
        );

        // Get start frame rectangle
        this._startWinArea = this._targetWindow.get_frame_rect();

        // Window area as local value
        let wLeft = this._startWinArea.x;
        let wTop = this._startWinArea.y;
        let wRight = wLeft + this._startWinArea.width;
        let wBottom = wTop + this._startWinArea.height;
        let wThirdX = wLeft + (this._startWinArea.width / 3);
        let wThirdY = wTop + (this._startWinArea.height / 3);
        let w34X = wLeft + ((this._startWinArea.width / 3) * 2);
        let w34Y = wTop + ((this._startWinArea.height / 3) * 2);

        // Detect window edge
        let edge = this._edgeSize();
        let topEdge = this._topEdgeSize();

        // Default edge: need move event for more actions
        this._edgeAction = WindowEdgeAction.WAIT_GESTURE;
        this._edgeGestured = false;

        // Check allow resize
        if (allowResize && this._targetWindow.allows_resize() &&
            this._targetWindow.allows_move()) {
            // Edge cursor position detection
            if (this._startPos.y >= wBottom - edge) {
                // Cursor on bottom of window
                this._edgeAction =
                    WindowEdgeAction.RESIZE |
                    WindowEdgeAction.RESIZE_BOTTOM;

                // 1/3 from left|right
                if (this._startPos.x <= wThirdX) {
                    this._edgeAction |= WindowEdgeAction.RESIZE_LEFT;
                }
                else if (this._startPos.x >= w34X) {
                    this._edgeAction |= WindowEdgeAction.RESIZE_RIGHT;
                }
            }
            else {
                if (this._startPos.x <= wLeft + edge) {
                    // Cursor on left side of window
                    this._edgeAction =
                        WindowEdgeAction.RESIZE |
                        WindowEdgeAction.RESIZE_LEFT;
                }
                else if (this._startPos.x >= wRight - edge) {
                    // Cursor on right side of window
                    this._edgeAction =
                        WindowEdgeAction.RESIZE |
                        WindowEdgeAction.RESIZE_RIGHT;
                }
                if (this._isEdge(WindowEdgeAction.RESIZE)) {
                    // 1/3 from top|bottom
                    if (this._startPos.y <= wThirdY) {
                        this._edgeAction |= WindowEdgeAction.RESIZE_TOP;
                    }
                    else if (this._startPos.y >= w34Y) {
                        this._edgeAction |= WindowEdgeAction.RESIZE_BOTTOM;
                    }
                }
            }
        }
        if (!this._isEdge(WindowEdgeAction.RESIZE)) {
            if (allowMove && this._startPos.y <= wTop + topEdge) {
                if (this._targetWindow.allows_move() &&
                    !this._targetWindow.get_maximized()) {
                    // Mouse in top side of window
                    this._edgeAction = WindowEdgeAction.MOVE;
                }
            }
        }

        return Clutter.EVENT_STOP;
    }

    // On touch gesture updated no targetWindow
    _touchUpdateNoWindow() {
        let threshold = this._gestureThreshold();
        let absX = Math.abs(this._movePos.x);
        let absY = Math.abs(this._movePos.y);

        // Gesture still undefined
        if (this._edgeAction == WindowEdgeAction.NONE) {
            // Move Value
            if (absX >= threshold || absY >= threshold) {
                let gestureValue = 0;
                let isVertical = false;
                if (absX > absY) {
                    // Horizontal Swipe
                    if (this._movePos.x < 0 - threshold) {
                        gestureValue = -1;
                        this._edgeAction = WindowEdgeAction.WAIT_GESTURE |
                            WindowEdgeAction.GESTURE_HORIZONTAL;

                    }
                    else if (this._movePos.x > threshold) {
                        gestureValue = 1;
                        this._edgeAction = WindowEdgeAction.WAIT_GESTURE |
                            WindowEdgeAction.GESTURE_HORIZONTAL;
                    }
                }
                else {
                    // Vertical Swipe
                    if (this._movePos.y < 0 - threshold) {
                        gestureValue = -1;
                        this._edgeAction = WindowEdgeAction.WAIT_GESTURE |
                            WindowEdgeAction.GESTURE_VERTICAL;
                        isVertical = true;
                    }
                    else if (this._movePos.y > threshold) {
                        gestureValue = 1;
                        this._edgeAction = WindowEdgeAction.WAIT_GESTURE |
                            WindowEdgeAction.GESTURE_VERTICAL;
                        isVertical = true;
                    }
                }
                if (gestureValue != 0) {
                    // Reset Move Position
                    this._movePos.x = 0;
                    this._movePos.y = 0;

                    // isVertical
                    let focusWindow = global.display.get_focus_window();
                    if (focusWindow) {
                        let listWin = [];
                        if (isVertical) {
                            // All Windows
                            listWin = global.display.list_all_windows();
                        }
                        else {
                            // Windows in workspace only
                            listWin = focusWindow
                                .get_workspace().list_windows();
                        }
                        let indexAct = listWin.indexOf(focusWindow);
                        if (indexAct > -1) {
                            let nextWin = indexAct + gestureValue;
                            if (nextWin < 0) {
                                nextWin = listWin.length - 1;
                            }
                            else if (nextWin >= listWin.length) {
                                nextWin = 0;
                            }
                            listWin[nextWin].activate(
                                global.get_current_time()
                            );
                        }
                    }
                }
            }
        }
        return Clutter.EVENT_STOP;
    }

    // On touch gesture updated
    _touchUpdate(dx, dy) {
        // Moving coordinat
        this._movePos.x += dx;
        this._movePos.y += dy;

        // Ignore if no target window
        if (this._targetWindow == null) {
            return this._touchUpdateNoWindow();
        }

        // Ignore if no edge action (will not happened btw)
        if (this._edgeAction == WindowEdgeAction.NONE) {
            this._clearVars();
            return Clutter.EVENT_PROPAGATE;
        }

        // Configs
        let allowResize = this._getEnableResize();
        let allowMove = this._getEnableMove();
        let allowMaxSnap = this._getEnableMaxSnap();
        let allowMoveSnap = this._getEnableMoveSnap();

        // Check edge flags
        if (this._isEdge(WindowEdgeAction.MOVE)) {
            if (!allowMove) {
                // Will not happening
                return Clutter.EVENT_STOP;
            }
            this._activateWindow();

            // Move cursor pointer
            this._movePointer(
                dx, dy
            );

            let edge = this._edgeSize();
            let mX = this._monitorArea.x;
            let mY = this._monitorArea.y;
            let mW = this._monitorArea.width;
            let mR = mX + mW;

            // let [pointerX, pointerY, pointerZ] = global.get_pointer();
            let hedge = edge / 2;
            let winX = this._startWinArea.x + this._movePos.x;
            let winY = this._startWinArea.y + this._movePos.y;
            let winR = winX + this._startWinArea.width;

            // Move action
            this._targetWindow.move_frame(
                true,
                winX, winY
            );

            if (allowMoveSnap && winX < mX) {
                this._showPreview(
                    this._monitorArea.x,
                    this._monitorArea.y,
                    this._monitorArea.width / 2,
                    this._monitorArea.height
                );
                this._edgeAction = WindowEdgeAction.MOVE
                    | WindowEdgeAction.MOVE_SNAP_LEFT;
            }
            else if (allowMoveSnap && winR > mR) {
                this._showPreview(
                    this._monitorArea.x + (this._monitorArea.width / 2),
                    this._monitorArea.y,
                    this._monitorArea.width / 2,
                    this._monitorArea.height
                );
                this._edgeAction = WindowEdgeAction.MOVE
                    | WindowEdgeAction.MOVE_SNAP_RIGHT;
            }
            else if (allowMoveSnap && winY < mY) {
                this._showPreview(
                    this._monitorArea.x,
                    this._monitorArea.y,
                    this._monitorArea.width,
                    this._monitorArea.height
                );
                this._edgeAction = WindowEdgeAction.MOVE
                    | WindowEdgeAction.MOVE_SNAP_TOP;
            }
            else {
                this._edgeAction = WindowEdgeAction.MOVE;
                this._hidePreview();
            }
        }
        else if (this._isEdge(WindowEdgeAction.RESIZE)) {
            if (!allowResize) {
                // Will not happening
                return Clutter.EVENT_STOP;
            }

            this._activateWindow();

            // Move cursor pointer
            this._movePointer(
                (this._isEdge(WindowEdgeAction.RESIZE_LEFT) ||
                    this._isEdge(WindowEdgeAction.RESIZE_RIGHT)) ? dx : 0,
                (this._isEdge(WindowEdgeAction.RESIZE_TOP) ||
                    this._isEdge(WindowEdgeAction.RESIZE_BOTTOM)) ? dy : 0
            );

            // Resize actions
            let tX = this._startWinArea.x;
            let tY = this._startWinArea.y;
            let tW = this._startWinArea.width;
            let tH = this._startWinArea.height;

            if (this._isEdge(WindowEdgeAction.RESIZE_BOTTOM)) {
                tH += this._movePos.y;
            }
            else if (this._isEdge(WindowEdgeAction.RESIZE_TOP)) {
                tY += this._movePos.y;
                tH -= this._movePos.y;
            }
            if (this._isEdge(WindowEdgeAction.RESIZE_RIGHT)) {
                tW += this._movePos.x;
            }
            else if (this._isEdge(WindowEdgeAction.RESIZE_LEFT)) {
                tX += this._movePos.x;
                tW -= this._movePos.x;
            }

            let tR = tX + tW;
            let tB = tY + tH;

            let mX = this._monitorArea.x;
            let mY = this._monitorArea.y;
            let mW = this._monitorArea.width;
            let mH = this._monitorArea.height;
            let mR = mX + mW;
            let mB = mY + mH;

            // edge
            if (tX < mX) {
                tX = mX;
                tW = tR - tX;
            }
            if (tY < mY) {
                tY = mY;
                tH = tB - tY;
            }
            if (tR > mR) {
                tW = mR - tX;
            }
            if (tB > mB) {
                tH = mB - tY;
            }


            // Resize Window
            this._targetWindow.move_resize_frame(
                true,
                tX, tY, tW, tH
            );
        }
        else if (this._isEdge(WindowEdgeAction.WAIT_GESTURE)) {
            let threshold = this._gestureThreshold();
            let absX = Math.abs(this._movePos.x);
            let absY = Math.abs(this._movePos.y);

            if (!this._edgeGestured) {
                if (absX >= threshold || absY >= threshold) {
                    if (absX > absY) {
                        if (this._movePos.x < 0 - threshold) {
                            if (!this._getHorizontalSwipeMode()) {
                                this._edgeAction |=
                                    WindowEdgeAction.GESTURE_LEFT;
                                this._edgeGestured = true;
                            }
                            else {
                                this._edgeAction = WindowEdgeAction.NONE;
                                this._targetWindow = null;
                                return this._touchUpdateNoWindow();
                            }
                        }
                        else if (this._movePos.x > threshold) {
                            if (!this._getHorizontalSwipeMode()) {
                                if (this._workspaceHavePrev()) {
                                    this._edgeAction |=
                                        WindowEdgeAction.GESTURE_RIGHT;
                                    this._edgeGestured = true;
                                }
                            }
                            else {
                                this._edgeAction = WindowEdgeAction.NONE;
                                this._targetWindow = null;
                                return this._touchUpdateNoWindow();
                            }
                        }
                    }
                    else {
                        if (this._movePos.y < 0 - threshold) {
                            this._edgeAction |= WindowEdgeAction.GESTURE_UP;
                            this._edgeGestured = true;
                        }
                        else if (this._movePos.y > threshold) {
                            if (this._targetWindow.is_fullscreen() ||
                                this._targetWindow.get_maximized()) {
                                this._edgeAction |=
                                    WindowEdgeAction.GESTURE_DOWN;
                                this._edgeGestured = true;
                            }
                            else {
                                if (allowMove &&
                                    this._targetWindow.allows_move()) {
                                    this._edgeAction = WindowEdgeAction.MOVE;
                                }
                            }
                        }
                    }
                }
                if (this._edgeGestured) {
                    /* Reset move position */
                    this._movePos.x = this._movePos.y = 0;
                }
            }
            else {
                let cancelThreshold = this._gestureCancelThreshold();
                let resetGesture = 0;
                let threshold2x = threshold * 2;
                /* Reset Gesture Detection */
                if (this._isEdge(WindowEdgeAction.GESTURE_LEFT)) {
                    if (this._movePos.x > cancelThreshold) {
                        resetGesture = 1;
                    }
                }
                else if (this._isEdge(WindowEdgeAction.GESTURE_RIGHT)) {
                    if (this._movePos.x < 0 - cancelThreshold) {
                        resetGesture = 1;
                    }
                }
                else if (this._isEdge(WindowEdgeAction.GESTURE_UP)) {
                    if (this._movePos.y > cancelThreshold) {
                        resetGesture = 1;
                    }
                    else if (!this._targetWindow.is_fullscreen() &&
                        (this._targetWindow.get_maximized()
                            != Meta.MaximizeFlags.BOTH)) {
                        // Tile Left / Right if not maximize / fullscreen
                        if (allowMaxSnap &&
                            this._movePos.x <= 0 - threshold2x) {
                            this._edgeAction |=
                                WindowEdgeAction.GESTURE_UP_LEFT;
                        }
                        else if (allowMaxSnap &&
                            this._movePos.x >= threshold2x) {
                            this._edgeAction |=
                                WindowEdgeAction.GESTURE_UP_RIGHT;
                        }
                        else {
                            this._edgeAction = WindowEdgeAction.GESTURE_UP |
                                WindowEdgeAction.WAIT_GESTURE;
                        }
                        resetGesture = 2;
                    }
                }
                else if (this._isEdge(WindowEdgeAction.GESTURE_DOWN)) {
                    if (this._movePos.y < 0 - cancelThreshold) {
                        resetGesture = 1;
                    }
                }
                if (resetGesture == 1) {
                    this._hidePreview();
                    this._edgeAction = WindowEdgeAction.WAIT_GESTURE;
                }
                else if (resetGesture == 2) {
                    /* Reset Y only */
                    this._movePos.y = 0;
                    if (this._movePos.x < 0 - threshold2x) {
                        this._movePos.x = 0 - (threshold2x + 5);
                    }
                    else if (this._movePos.x > threshold2x) {
                        this._movePos.x = threshold2x + 5;
                    }
                }
                else {
                    /* Reset move position */
                    this._movePos.x = this._movePos.y = 0;
                }
            }

            if (this._edgeGestured) {
                this._activateWindow();
                if (this._isEdge(WindowEdgeAction.GESTURE_UP)) {
                    if (allowMaxSnap &&
                        this._isEdge(WindowEdgeAction.GESTURE_UP_LEFT)) {
                        this._showPreview(
                            this._monitorArea.x,
                            this._monitorArea.y,
                            this._monitorArea.width / 2,
                            this._monitorArea.height
                        );
                    }
                    else if (allowMaxSnap &&
                        this._isEdge(WindowEdgeAction.GESTURE_UP_RIGHT)) {
                        this._showPreview(
                            this._monitorArea.x + (this._monitorArea.width / 2),
                            this._monitorArea.y,
                            this._monitorArea.width / 2,
                            this._monitorArea.height
                        );
                    }
                    else {
                        this._showPreview(
                            this._monitorArea.x,
                            this._monitorArea.y,
                            this._monitorArea.width,
                            this._monitorArea.height
                        );
                    }
                }
                else if (this._isEdge(WindowEdgeAction.GESTURE_LEFT)) {
                    this._showPreview(
                        this._monitorArea.x
                        + this._monitorArea.width
                        - this._startWinArea.width,
                        this._startWinArea.y,
                        this._startWinArea.width,
                        this._startWinArea.height
                    );
                }
                else if (this._isEdge(WindowEdgeAction.GESTURE_RIGHT)) {
                    this._showPreview(
                        this._monitorArea.x,
                        this._startWinArea.y,
                        this._startWinArea.width,
                        this._startWinArea.height
                    );
                }
                else if (this._isEdge(WindowEdgeAction.GESTURE_DOWN)) {
                    this._showPreview(
                        this._monitorArea.x + (this._monitorArea.width / 4),
                        this._monitorArea.y + (this._monitorArea.height / 4),
                        this._monitorArea.width / 2,
                        this._monitorArea.height / 2
                    );
                }
            }
        }

        return Clutter.EVENT_STOP;
    }

    // On touch gesture ended
    _touchEnd() {
        /* No target window? return directly */
        if (this._targetWindow == null) {
            this._clearVars();
            return Clutter.EVENT_STOP;
        }

        // Configs
        let allowMaxSnap = this._getEnableMaxSnap();
        let allowMoveSnap = this._getEnableMoveSnap();

        /* Check Gestures */
        if (this._isEdge(WindowEdgeAction.WAIT_GESTURE)) {
            if (this._isEdge(WindowEdgeAction.GESTURE_UP)) {
                // Maximize / Fullscreen
                if (this._targetWindow.get_maximized() ==
                    Meta.MaximizeFlags.BOTH) {
                    if (!this._targetWindow.is_fullscreen()) {
                        this._targetWindow.make_fullscreen();
                    }
                    else {
                        this._targetWindow.unmake_fullscreen();
                    }
                }
                else if (this._targetWindow.can_maximize()) {
                    if (allowMaxSnap &&
                        this._isEdge(WindowEdgeAction.GESTURE_UP_LEFT)) {
                        this._setSnapWindow(0);
                    }
                    else if (allowMaxSnap &&
                        this._isEdge(WindowEdgeAction.GESTURE_UP_RIGHT)) {
                        this._setSnapWindow(1);
                    }
                    else {
                        this._targetWindow.maximize(Meta.MaximizeFlags.BOTH);
                    }
                }
            }
            else if (this._isEdge(WindowEdgeAction.GESTURE_DOWN)) {
                // Un-Fullscreen & Un-Maximize
                if (this._targetWindow.is_fullscreen()) {
                    this._targetWindow.unmake_fullscreen();
                }
                else if (this._targetWindow.get_maximized()) {
                    this._targetWindow.unmaximize(
                        Meta.MaximizeFlags.BOTH
                    );
                }
            }
            else if (this._isEdge(WindowEdgeAction.GESTURE_LEFT)) {
                // Move to right workspace
                this._moveWindowWorkspace(1);
            }
            else if (this._isEdge(WindowEdgeAction.GESTURE_RIGHT)) {
                // Move to left workspace
                this._moveWindowWorkspace(0);
            }
        }
        else if (allowMoveSnap && this._isEdge(WindowEdgeAction.MOVE)) {
            if (this._isEdge(WindowEdgeAction.MOVE_SNAP_TOP)) {
                if (this._targetWindow.can_maximize()) {
                    this._resetWinPos();
                    this._targetWindow.maximize(Meta.MaximizeFlags.BOTH);
                }
            }
            else if (this._isEdge(WindowEdgeAction.MOVE_SNAP_LEFT)) {
                this._resetWinPos();
                this._setSnapWindow(0);
            }
            else if (this._isEdge(WindowEdgeAction.MOVE_SNAP_RIGHT)) {
                this._resetWinPos();
                this._setSnapWindow(1);
            }
        }
        this._clearVars();

        return Clutter.EVENT_STOP;
    }

    setTimeout(func, delay, ...args) {
        return GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            func(...args);
            return GLib.SOURCE_REMOVE;
        });
    }

    clearTimeout(id) {
        GLib.source_remove(id);
    }

    // Run Action
    _pinchAction(id) {
        const _LCASE = 32;
        if (id == 1) {
            // Minimize
            let activeWin = global.display.get_focus_window();
            if (activeWin) {
                if (activeWin.can_minimize()) {
                    activeWin.minimize();
                }
            }
        }
        else if (id == 2) {
            // Close Window (ALT+F4)
            this._sendKeyPress([Clutter.KEY_Alt_L, Clutter.KEY_F4]);
        }
        else if (id == 3) {
            // Show Desktop (Super+D)  Clutter.KEY_D
            this._sendKeyPress([Clutter.KEY_Super_L, Clutter.KEY_D + _LCASE]);
        }
        else if (id == 4) {
            // Overview (Super)
            this._sendKeyPress([Clutter.KEY_Super_L]);
        }
        else if (id == 5) {
            // Show Apps (Super+A)
            this._sendKeyPress([Clutter.KEY_Super_L, Clutter.KEY_A + _LCASE]);
        }
    }

    // Update Pinch
    _pinchUpdate(pinch_scale) {
        if (this._pinch.begin) {
            let pIn = (this._getPinchInScale() / 100.0);
            let pOut = (this._getPinchOutScale() / 100.0);
            if (this._pinch.action == 0) {
                if (pinch_scale <= pIn) {
                    this._pinch.action = 1;
                }
                else if (pinch_scale >= pOut) {
                    this._pinch.action = 2;
                }
            }
            else if (this._pinch.action == 1) {
                // Pinch-In
                this._pinch.canceled = (pinch_scale <= pIn) ? false : true;
            }
            else if (this._pinch.action == 2) {
                // Pinch-Out
                this._pinch.canceled = (pinch_scale >= pOut) ? false : true;
            }
        }
        return Clutter.EVENT_STOP;
    }

    // End Pinch
    _pinchEnd() {
        if (!this._pinch.canceled && this._pinch.begin &&
            this._pinch.action != 0 && this._pinch.fingers >= 3 &&
            this._pinch.fingers <= 4) {
            try {
                let cfg_name = "pinch" + this._pinch.fingers + "-" +
                    ((this._pinch.action == 1) ? "in" : "out");
                let action_id = this._settings.get_int(cfg_name);

                log(
                    "WGS - pinchEnd: " + cfg_name + " / actionid: " +
                    action_id
                );

                if (action_id > 0) {
                    // Execute action
                    this._pinchAction(action_id);
                }
            } catch (err) {
                log("Error Action = " + err);
            }
        }
        this._clearVars();
        return Clutter.EVENT_STOP;
    }

    // Pinch Handler
    _pinchEventHandler(actor, event) {
        if (!this._getPinchEnabled()) {
            return Clutter.EVENT_PROPAGATE;
        }
        let numfingers = event.get_touchpad_gesture_finger_count();
        if (numfingers != 3 && numfingers != 4) {
            return Clutter.EVENT_PROPAGATE;
        }
        const pinch_scale = event.get_gesture_pinch_scale();

        // Process gestures state
        switch (event.get_gesture_phase()) {
            case Clutter.TouchpadGesturePhase.BEGIN:
                this._pinch.fingers = numfingers;
                this._pinch.begin = true;
                this._pinch.canceled = false;
                this._pinch.action = 0;
                return Clutter.EVENT_STOP;

            case Clutter.TouchpadGesturePhase.UPDATE:
                return this._pinchUpdate(pinch_scale);

            default:
                return this._pinchEnd();
        }

        return Clutter.EVENT_STOP;
    }

    // Touch Event Handler
    _touchEvent(actor, event) {

        // Only process swipe event
        if (event.type() == Clutter.EventType.TOUCHPAD_PINCH)
            return this._pinchEventHandler(actor, event);

        // Only process swipe event
        if (event.type() != Clutter.EventType.TOUCHPAD_SWIPE)
            return Clutter.EVENT_PROPAGATE;

        // Only process configured finger gesture
        if (event.get_touchpad_gesture_finger_count()
            != this._gestureNumFinger())
            return Clutter.EVENT_PROPAGATE;

        // Process gestures state
        switch (event.get_gesture_phase()) {
            case Clutter.TouchpadGesturePhase.BEGIN:
                // Begin event
                return this._touchStarted();

            case Clutter.TouchpadGesturePhase.UPDATE:
                // Update / move event
                let [dx, dy] = event.get_gesture_motion_delta();
                return this._touchUpdate(
                    dx * this._getAcceleration(),
                    dy * this._getAcceleration()
                );

            default:
                // Cancel / end event
                return this._touchEnd();
        }
        return Clutter.EVENT_STOP;
    }

}

// Export Extension
export default class WindowGesturesExtension extends Extension {
    // Enable Extension
    enable() {
        this.manager = new Manager(this);
    }

    // Disable Extension
    disable() {
        this.manager.destroy();
        this.manager = null;
    }
}