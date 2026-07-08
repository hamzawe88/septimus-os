# Septimus OS Deep Codebase Analysis

This document contains a file-by-file, function-by-function analysis of the entire codebase.

## File: `./generate_docs.py`

### Functions/Components

- `extract_ts_functions`
- `extract_py_functions`
- `extract_go_functions`
- **Lines of Code**: 53

## File: `./frontend/next-env.d.ts`

*No explicit functions detected or file is purely declarative.*

- **Lines of Code**: 6

## File: `./frontend/next.config.ts`

*No explicit functions detected or file is purely declarative.*

- **Lines of Code**: 7

## File: `./frontend/src/types/index.ts`

*No explicit functions detected or file is purely declarative.*

- **Lines of Code**: 49

## File: `./frontend/src/app/layout.tsx`

### Functions/Components

- `RootLayout`
- **Lines of Code**: 34

## File: `./frontend/src/app/page.tsx`

### Functions/Components

- `ChannelWelcome`
- `MessageRow`
- `handleSendMessage`
- `Home`
- **Lines of Code**: 347

## File: `./frontend/src/components/ThemeProvider.tsx`

### Functions/Components

- `ThemeProvider`
- **Lines of Code**: 9

## File: `./frontend/src/components/pm/TaskCard.tsx`

### Functions/Components

- `TaskCard`
- **Lines of Code**: 105

## File: `./frontend/src/components/pm/KanbanBoard.tsx`

### Functions/Components

- `KanbanBoard`
- `onDragEnd`
- **Lines of Code**: 198

## File: `./frontend/src/components/pm/NewTaskModal.tsx`

### Functions/Components

- `NewTaskModal`
- **Lines of Code**: 111

## File: `./frontend/src/components/ui/card.tsx`

### Functions/Components

- `Card`
- `CardContent`
- `CardDescription`
- `CardTitle`
- `CardFooter`
- `CardHeader`
- `CardAction`
- **Lines of Code**: 103

## File: `./frontend/src/components/ui/scroll-area.tsx`

### Functions/Components

- `ScrollBar`
- `ScrollArea`
- **Lines of Code**: 55

## File: `./frontend/src/components/ui/resizable.tsx`

### Functions/Components

- `ResizablePanelGroup`
- `ResizableHandle`
- `ResizablePanel`
- **Lines of Code**: 50

## File: `./frontend/src/components/ui/avatar.tsx`

### Functions/Components

- `AvatarImage`
- `Avatar`
- `AvatarFallback`
- `AvatarBadge`
- `AvatarGroupCount`
- `AvatarGroup`
- **Lines of Code**: 109

## File: `./frontend/src/components/ui/dialog.tsx`

### Functions/Components

- `DialogClose`
- `Dialog`
- `DialogFooter`
- `DialogOverlay`
- `DialogHeader`
- `DialogTitle`
- `DialogTrigger`
- `DialogDescription`
- `DialogContent`
- `DialogPortal`
- **Lines of Code**: 160

## File: `./frontend/src/components/ui/badge.tsx`

### Functions/Components

- `Badge`
- **Lines of Code**: 52

## File: `./frontend/src/components/ui/button.tsx`

### Functions/Components

- `Button`
- **Lines of Code**: 58

## File: `./frontend/src/components/ui/textarea.tsx`

### Functions/Components

- `Textarea`
- **Lines of Code**: 18

## File: `./frontend/src/components/ui/input.tsx`

### Functions/Components

- `Input`
- **Lines of Code**: 20

## File: `./frontend/src/components/messages/Cards.tsx`

### Functions/Components

- `EntityCard`
- `AIProposalCard`
- **Lines of Code**: 99

## File: `./frontend/src/components/layout/ThreadSidebar.tsx`

### Functions/Components

- `ThreadSidebar`
- `handleWsMessage`
- `handleSendReply`
- **Lines of Code**: 118

## File: `./frontend/src/components/layout/TopBar.tsx`

### Functions/Components

- `handleClickOutside`
- `TopBar`
- **Lines of Code**: 252

## File: `./frontend/src/components/layout/AttendanceModal.tsx`

### Functions/Components

- `getLocation`
- `getDistanceFromLatLonInM`
- `deg2rad`
- `AttendanceModal`
- **Lines of Code**: 182

## File: `./frontend/src/components/layout/MapComponent.tsx`

### Functions/Components

- `MapComponent`
- **Lines of Code**: 62

## File: `./frontend/src/components/layout/Sidebar.tsx`

### Functions/Components

- `DMItem`
- `ChannelItem`
- `SidebarSection`
- `Sidebar`
- `SidebarDivider`
- **Lines of Code**: 277

## File: `./frontend/src/components/layout/SettingsModal.tsx`

### Functions/Components

- `handleSaveNotifs`
- `handleSaveProfile`
- `SettingsModal`
- **Lines of Code**: 261

## File: `./frontend/src/components/shared/MessageInput.tsx`

### Functions/Components

- `handleKeyDown`
- `handleSend`
- `handleInput`
- `MessageInput`
- `handleEmojiClick`
- **Lines of Code**: 206

## File: `./frontend/src/components/shared/EntityCreatorModal.tsx`

### Functions/Components

- `EntityCreatorModal`
- **Lines of Code**: 118

## File: `./frontend/src/components/shared/NewChannelModal.tsx`

### Functions/Components

- `NewChannelModal`
- **Lines of Code**: 108

## File: `./frontend/src/components/shared/NewDmModal.tsx`

### Functions/Components

- `toggleUser`
- `NewDmModal`
- **Lines of Code**: 154

## File: `./frontend/src/components/shared/LoginScreen.tsx`

### Functions/Components

- `LoginScreen`
- **Lines of Code**: 89

## File: `./frontend/src/components/huddles/HuddleWidget.tsx`

### Functions/Components

- `updateVolume`
- `HuddleWidget`
- `handleToggleMute`
- **Lines of Code**: 121

## File: `./frontend/src/lib/utils.ts`

### Functions/Components

- `cn`
- **Lines of Code**: 6

## File: `./frontend/src/store/useAppStore.ts`

*No explicit functions detected or file is purely declarative.*

- **Lines of Code**: 77

## File: `./backend-core/main.go`

### Functions/Components

- `main`
- **Lines of Code**: 90

## File: `./backend-core/middleware/jwt.go`

### Functions/Components

- `JWTMiddleware`
- `getJWTSecret`
- **Lines of Code**: 55

## File: `./backend-core/database/database.go`

### Functions/Components

- `ConnectDB`
- `ParseUUID`
- **Lines of Code**: 78

## File: `./backend-core/models/models.go`

*No explicit functions detected or file is purely declarative.*

- **Lines of Code**: 178

## File: `./backend-core/events/nats.go`

### Functions/Components

- `ConnectNATS`
- `PublishEvent`
- `createStream`
- **Lines of Code**: 67

## File: `./backend-core/handlers/users.go`

### Functions/Components

- `SearchUsers`
- **Lines of Code**: 37

## File: `./backend-core/handlers/upload.go`

### Functions/Components

- `HandleUpload`
- **Lines of Code**: 41

## File: `./backend-core/handlers/system.go`

### Functions/Components

- `InjectSystemMessage`
- **Lines of Code**: 63

## File: `./backend-core/handlers/auth.go`

### Functions/Components

- `Register`
- `Login`
- `getJWTSecret`
- **Lines of Code**: 109

## File: `./backend-core/handlers/pm.go`

### Functions/Components

- `GetTasks`
- `GetProjects`
- `CanTransition`
- `CreateTask`
- `TransitionTask`
- `CreateProject`
- **Lines of Code**: 240

## File: `./backend-core/handlers/search.go`

### Functions/Components

- `SearchMessages`
- **Lines of Code**: 40

## File: `./backend-core/handlers/threads.go`

### Functions/Components

- `GetMessageReplies`
- **Lines of Code**: 33

## File: `./backend-core/handlers/websocket.go`

### Functions/Components

- `WSAuthMiddleware`
- `WebsocketHandler`
- `Run`
- `NewHub`
- **Lines of Code**: 205

## File: `./backend-core/handlers/entities.go`

### Functions/Components

- `CreateEntity`
- `GetEntities`
- **Lines of Code**: 119

## File: `./backend-core/handlers/channels.go`

### Functions/Components

- `CreateChannel`
- `GetMessages`
- `GetChannels`
- **Lines of Code**: 118

## File: `./ai-agents/main.py`

### Functions/Components

- `lifespan`
- `health_check`
- **Lines of Code**: 47

## File: `./ai-agents/agents/orchestrator.py`

### Functions/Components

- `run_agent_team`
- **Lines of Code**: 24

## File: `./ai-agents/events/nats_listener.py`

### Functions/Components

- `task_event_handler`
- `message_handler`
- `start_nats_listener`
- **Lines of Code**: 99
