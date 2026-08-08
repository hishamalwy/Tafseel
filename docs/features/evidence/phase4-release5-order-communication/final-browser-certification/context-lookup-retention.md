# Context lookup retention

`js/chat-widget.js` still has no `findPaged`. Order context uses `GET /orders/{resourceId}` and `GET /learning-requests/{learningRequestId}`. CI `check-release5-order-communication.mjs` asserts both.

Integration: targeted owned Order GET `ReadCount < 20`. 1,000-item scan path remains closed.
