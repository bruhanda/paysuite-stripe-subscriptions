// src/events/dispatcher.ts
function createDispatcher() {
  return makeDispatcher({ handlers: /* @__PURE__ */ new Map(), anyHandlers: [] });
}
function makeDispatcher(internals) {
  return {
    on(name, handler) {
      const next = new Map(internals.handlers);
      next.set(name, handler);
      return makeDispatcher({
        handlers: next,
        anyHandlers: internals.anyHandlers
      });
    },
    onAny(handler) {
      return makeDispatcher({
        handlers: internals.handlers,
        anyHandlers: [...internals.anyHandlers, handler]
      });
    },
    build() {
      const handlers = new Map(internals.handlers);
      const anyHandlers = [...internals.anyHandlers];
      const registered = new Set(handlers.keys());
      return {
        registered,
        async dispatch(event) {
          const typed = handlers.get(event.type);
          if (typed !== void 0) await typed(event);
          for (const any of anyHandlers) await any(event);
        }
      };
    }
  };
}

// src/events/filters.ts
function isSubscriptionEvent(event) {
  return event.type.startsWith("customer.subscription.");
}
function isInvoiceEvent(event) {
  return event.type.startsWith("invoice.");
}
function isCheckoutSessionEvent(event) {
  return event.type.startsWith("checkout.session.");
}

export { createDispatcher, isCheckoutSessionEvent, isInvoiceEvent, isSubscriptionEvent };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map