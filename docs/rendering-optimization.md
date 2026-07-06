## Problem

UI is very laggy and inconsistent 


## proposed solution

when a user loggs in or directly loads or refreshes the dashboard page we
can fetch all the user notes and create a global state

- this global state acts as a single source of truth for all UI 


- when a user create, updates, deletes any note is should first apply to this 
global state and the changes would be instant without waiting for and database 
operation

What happens when a user creates a new note?
- when a user click on create new note, user is show with the dialog with note editor instantly where he can type instantly, and parllely a event is registered of new note create in background, the content of the note that user writes is stored in memory or localstorage so that id doesnt get lost when user closes the note instantly after writing something, the event updates the global state which results in the update of user note in db keeping everything in sync

- by default new note is private so there is no need to stablish socket connection until the note is public

- socket connection is a secondary task and should only be established if the note is public so that there is no overhead

When this global state become stale?
- when user updates any note
- user creates any note
- user delete any note
- note specific settings like public/private or edit/view-only should be done via socket its instant and using already presnt pub/sub model every viewer gets updated setting and is applied instantly 



we can user event based system or queue based system to keep our db and UI in sync and refetching everthin whenever the db data changes

also when user switches between tabs a new request is made it can hit performance and overwhelm database, so if user make a request and imediately switches to another tab the previous request should be cancled


the whole point of all this is everything should be in sync without complicating things and UI should be snappy every update or change is optimistic instant