# @deliverybot/core

Core contains the key interfaces for services and applications that are used by
all apps.

### Applications

An application is simply a function that takes `Dependencies` and sets up routes
or event handlers accordingly. For example:

```javascript
export function slackbot({ app, kvService, config }: Dependencies) {
  const store = new SlackUserStore(kvService);
  const locker = new EnvLockStore(kvService);

  app.get("/slack/install", (req, res) => {
    res.redirect(config.slackLoginUrl!);
  });
});
```

### Services

There are some key services that are implemented by a specific infrastructure
and deployment target. This is defined in the below interface:

```javascript
export interface Services {
  lockService: LockService;
  kvService: KVService;
  messageService: MessageService;
  userService: UserService;
}
```

To implement a specific store add a class that takes in the kvServices.

```javascript
export class WatchStore {
  store: KVStore<WatchJSON>;

  constructor(kv: KVService) {
    this.store = kv();
  }
}
```
