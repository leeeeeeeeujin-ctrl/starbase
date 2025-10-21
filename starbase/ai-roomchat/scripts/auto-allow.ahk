; AutoHotkey v1 script to auto-click Allow/Yes buttons in VS Code dialogs
; WARNING: Use with caution. May click unintended dialogs.
; Run AutoHotkey as administrator for better window access.

#Persistent
SetTitleMatchMode, 2  ; partial title match
SetControlDelay, 10

; Poll every 300ms
SetTimer, CheckDialogs, 300
return

CheckDialogs:
    ; VS Code confirm dialogs
    IfWinExist, Visual Studio Code
    {
        WinGet, id, ID, Visual Studio Code
        ; Try common button captions
        ControlClick, Button1, ahk_id %id%,, Left, 1, NA
        ControlClick, &Yes, ahk_id %id%,, Left, 1, NA
        ControlClick, Yes, ahk_id %id%,, Left, 1, NA
        ControlClick, Allow, ahk_id %id%,, Left, 1, NA
        ControlClick, &Allow, ahk_id %id%,, Left, 1, NA
    }

    ; Generic Electron dialog
    IfWinExist, Electron
    {
        WinGet, id2, ID, Electron
        ControlClick, Button1, ahk_id %id2%,, Left, 1, NA
        ControlClick, OK, ahk_id %id2%,, Left, 1, NA
        ControlClick, Allow, ahk_id %id2%,, Left, 1, NA
    }
return

; Optional: ImageSearch approach (provide your own images)
; ImageSearch, FoundX, FoundY, 0, 0, A_ScreenWidth, A_ScreenHeight, *100 allow.png
; if (ErrorLevel = 0) {
;     Click, %FoundX%, %FoundY%
; }
