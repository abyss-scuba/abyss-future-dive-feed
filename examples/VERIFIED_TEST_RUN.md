# Verified test run

The package was exercised against the rendered `/widget-all` capture supplied on 10 July 2026.

Result:

- source wrappers discovered: 3;
- widget 4745 rows parsed: 50;
- widget 4746 rows parsed: 50;
- widget 4747 rows parsed: 12;
- raw source records: 112;
- public-window records from day 21 through day 90: 67;
- public search endpoint: 8 October 2026;
- validation errors: 0;
- unit tests: 6 passed.

This verifies the parser against the current rendered table, hidden expanded-row, price and `?q=` booking-link structure. It is not a substitute for the first live GitHub Actions run, because the live widgets and pagination are asynchronous.
