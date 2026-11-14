// Grindstone's tiny test runner (ADR 0008, chapter 3 "Tests that lie"; docs/features/levels.md "The Tests panel"): what a
// pull request's test files (`*.test.js`) run on in the Tests panel. It gives them, as globals like Jest's, `test` (also
// `it`), `expect` with a small set of matchers (each also as `.not`) and `vi` with `fn` and `spyOn`:
//
// - toBe (Object.is), toEqual (deep as Vitest: -0 is not 0, a property set to undefined is none), toBeCloseTo(n, digits = 2), toContain (a string or an array),
//   toThrow(message?: a substring or a pattern), toBeTruthy, toBeFalsy,
// - toHaveBeenCalled, toHaveBeenCalledTimes(n), toHaveBeenCalledWith(...args) for a mock,
// - toMatchInlineSnapshot(text): the value as text against the snapshot, its first and last blank lines and common
//   indentation taken off (a string as it is, no quotes; anything else as the runner prints it),
// - vi.fn(impl?) with `.mock.calls`, `.mockReturnValue(value)`, `.mockImplementation(fn)`; vi.spyOn(object, name)
//   replaces a method with a mock that calls it, put back after each test.
//
// No describe, hooks, timers or module mocks: the levels don't need them. Every matcher that runs counts as a **check**
// of its test, so the panel can say a test passed without checking anything. Failures read like Jest's ("Expected: 8.4",
// "Received: 8.39"). Tests run one after another (an async one is awaited); a test is the level's, not the player's, but
// the runner still caps what it keeps: TEST_LIMITS tests, names, messages, stacks and printed values are cut. An endless
// test is the frame's job: the runner lives in a worker, and the frame's watchdog stops it (test-sandbox.ts).
// JavaScript in a string like the bridge (block comments only, every statement ends with a semicolon). Tested on Node in
// test/unit/levels/review/test-runner.test.ts with this very source, in a browser in e2e/ai-review.spec.ts.

/** What a test run keeps and how long it waits (the frame's watchdog and the page read the same numbers). */
export const TEST_LIMITS = {
  /** Tests one run keeps (the first ones; the rest are counted as left out). */
  maxTests: 100,
  /** Characters of a test's name. */
  maxName: 200,
  /** Characters of a failure's message. */
  maxMessage: 2000,
  /** Characters of a stack. */
  maxStack: 4000,
  /** Characters of one printed value in a message. */
  maxPreview: 300,
  /** Milliseconds one test may run before the frame stops it ("did not finish"). */
  testMs: 2000,
  /** Milliseconds one test file may take to load. */
  loadMs: 3000,
  /** Fresh workers after a test or a file that did not finish (each goes on after it); then the run stops. */
  maxRestarts: 5
} as const

export type TestLimits = typeof TEST_LIMITS

/**
 * The runner as a factory of the limits: `{ test, expect, vi, setFile, count, describe, run }`. `setFile(path)` names
 * the file whose tests register next; `run(from, onStart, onResult, onDone)` runs the tests from index `from` in the
 * order they registered and reports each (`{ ok, checks, error }`, an error as `{ name, message, stack }`), then
 * `onDone(dropped)` with how many tests were over the cap.
 */
export const TEST_RUNNER_SOURCE = String.raw`(function (limits) {
  'use strict';
  var objectIs = Object.is;
  var keysOf = Object.keys;
  var isArray = Array.isArray;
  var hasOwn = Object.prototype.hasOwnProperty;
  var NativeError = Error;
  var NativeRegExp = RegExp;
  var NativeWeakSet = WeakSet;
  var mathAbs = Math.abs;
  var mathPow = Math.pow;
  var toText = String;
  var quote = JSON.stringify;
  var later = setTimeout;

  /* Text cut at max characters, an ellipsis at the end when it was longer. */
  var cut = function (text, max) {
    text = toText(text);
    return text.length > max ? text.slice(0, max - 1) + '…' : text;
  };
  var mocks = new NativeWeakSet();

  /* A value as the runner prints it: strings quoted, objects and arrays a few levels deep and a few entries wide. */
  var show = function (value, depth, seen) {
    if (typeof value === 'string') return quote(value.length > limits.maxPreview ? value.slice(0, limits.maxPreview) : value);
    if (typeof value === 'number') return objectIs(value, -0) ? '-0' : toText(value);
    if (typeof value === 'bigint') return toText(value) + 'n';
    if (value === undefined || value === null || typeof value === 'boolean') return toText(value);
    if (typeof value === 'symbol') return value.toString();
    if (typeof value === 'function') return mocks.has(value) ? '[mock function]' : '[Function ' + (value.name || 'anonymous') + ']';
    if (seen.indexOf(value) >= 0) return '[Circular]';
    if (value instanceof NativeError) return toText(value.name) + ': ' + toText(value.message);
    if (depth >= 3) return isArray(value) ? '[Array]' : '[Object]';
    seen = seen.concat([value]);
    var parts = [];
    var i;
    if (isArray(value)) {
      for (i = 0; i < value.length && i < 20; i++) parts.push(show(value[i], depth + 1, seen));
      if (value.length > 20) parts.push('…');
      return '[' + parts.join(', ') + ']';
    }
    var keys = keysOf(value);
    for (i = 0; i < keys.length && i < 20; i++) parts.push(keys[i] + ': ' + show(value[keys[i]], depth + 1, seen));
    if (keys.length > 20) parts.push('…');
    return parts.length ? '{ ' + parts.join(', ') + ' }' : '{}';
  };
  var preview = function (value) {
    try { return cut(show(value, 0, []), limits.maxPreview); } catch (error) { return '[a value that could not be printed]'; }
  };

  /* An object's own enumerable keys that hold a value: toEqual reads a property set to undefined as no property. */
  var definedKeys = function (value) {
    var keys = keysOf(value);
    var kept = [];
    for (var i = 0; i < keys.length; i++) if (value[keys[i]] !== undefined) kept.push(keys[i]);
    return kept;
  };
  /* Deep equality as Vitest's toEqual has it: Object.is for every value (-0 is not 0, NaN is NaN), arrays item by item
     with their length, objects by their own keys, a property set to undefined counting as none. */
  var equal = function (a, b, seen) {
    if (objectIs(a, b)) return true;
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
    if (isArray(a) !== isArray(b)) return false;
    for (var s = 0; s < seen.length; s++) if (seen[s][0] === a && seen[s][1] === b) return true;
    seen = seen.concat([[a, b]]);
    var i;
    if (isArray(a)) {
      if (a.length !== b.length) return false;
      for (i = 0; i < a.length; i++) if (!equal(a[i], b[i], seen)) return false;
      return true;
    }
    var keysA = definedKeys(a);
    var keysB = definedKeys(b);
    if (keysA.length !== keysB.length) return false;
    for (i = 0; i < keysA.length; i++) {
      if (!hasOwn.call(b, keysA[i]) || !equal(a[keysA[i]], b[keysA[i]], seen)) return false;
    }
    return true;
  };

  /* A snapshot as written in a template string: its first and last blank lines and the common indentation off. */
  var dedent = function (text) {
    var lines = toText(text).split('\n');
    if (lines.length && lines[0].trim() === '') lines.shift();
    if (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    var indent = null;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].trim() === '') continue;
      var lead = /^[ \t]*/.exec(lines[i])[0].length;
      if (indent === null || lead < indent) indent = lead;
    }
    for (var j = 0; j < lines.length; j++) lines[j] = lines[j].slice(indent || 0);
    return lines.join('\n');
  };
  var block = function (text) { return '  ' + toText(text).split('\n').join('\n  '); };

  var assertion = function (message) {
    var error = new NativeError(cut(message, limits.maxMessage));
    error.name = 'AssertionError';
    return error;
  };

  /* The running test's record (its checks); null between tests. */
  var current = null;

  var expect = function (actual) {
    var make = function (negated) {
      var header = function (name, args) { return 'expect(received).' + (negated ? 'not.' : '') + name + '(' + args + ')'; };
      var check = function (name, args, pass, details) {
        if (current) current.checks++;
        if (pass !== negated) return;
        throw assertion(header(name, args) + '\n\n' + details());
      };
      var refuse = function (name, args, why) {
        if (current) current.checks++;
        throw assertion(header(name, args) + '\n\n' + why);
      };
      var wanted = function (value) { return 'Expected: ' + (negated ? 'not ' : '') + preview(value); };
      var received = function () { return 'Received: ' + preview(actual); };
      var callsOf = function (name, args) {
        if (!mocks.has(actual)) refuse(name, args, 'Received value must be a mock function: ' + preview(actual));
        return actual.mock.calls;
      };
      return {
        toBe: function (value) {
          check('toBe', 'expected', objectIs(actual, value), function () {
            var deep = !negated && equal(actual, value, []) ? '\n\nIf it should pass with deep equality, use toEqual.' : '';
            return wanted(value) + '\n' + received() + deep;
          });
        },
        toEqual: function (value) {
          check('toEqual', 'expected', equal(actual, value, []), function () { return wanted(value) + '\n' + received(); });
        },
        toBeCloseTo: function (value, precision) {
          var digits = precision === undefined ? 2 : precision;
          var allowed = mathPow(10, -digits) / 2;
          var numbers = typeof actual === 'number' && typeof value === 'number';
          var difference = numbers ? mathAbs(value - actual) : NaN;
          check('toBeCloseTo', 'expected, precision', numbers && (actual === value || difference < allowed), function () {
            return wanted(value) + '\n' + received() + '\n\nExpected precision: ' + digits + '\nExpected difference: ' + (negated ? '≥ ' : '< ') + allowed + '\nReceived difference: ' + (numbers ? difference : 'not a number');
          });
        },
        toContain: function (item) {
          var pass = false;
          if (typeof actual === 'string') pass = typeof item === 'string' && actual.indexOf(item) >= 0;
          else if (isArray(actual)) for (var i = 0; i < actual.length; i++) if (objectIs(actual[i], item)) pass = true;
          check('toContain', 'expected', pass, function () { return 'Expected: ' + (negated ? 'not ' : '') + 'to contain ' + preview(item) + '\n' + received(); });
        },
        toBeTruthy: function () {
          check('toBeTruthy', '', !!actual, received);
        },
        toBeFalsy: function () {
          check('toBeFalsy', '', !actual, received);
        },
        toThrow: function (value) {
          var args = value === undefined ? '' : 'expected';
          if (typeof actual !== 'function') refuse('toThrow', args, 'Received value must be a function: ' + preview(actual));
          var threw = false;
          var error;
          try { actual(); } catch (caught) { threw = true; error = caught; }
          var message = '';
          if (threw) {
            try { message = error !== null && typeof error === 'object' && typeof error.message === 'string' ? error.message : toText(error); } catch (failed) { message = ''; }
          }
          var matches = value === undefined || (value instanceof NativeRegExp ? value.test(message) : message.indexOf(toText(value)) >= 0);
          check('toThrow', args, threw && matches, function () {
            if (negated) return 'Received function threw: ' + preview(message);
            if (!threw) return 'Received function did not throw';
            return (value instanceof NativeRegExp ? 'Expected pattern: ' + toText(value) : 'Expected substring: ' + preview(toText(value))) + '\nReceived message: ' + preview(message);
          });
        },
        toHaveBeenCalled: function () {
          var calls = callsOf('toHaveBeenCalled', '');
          check('toHaveBeenCalled', '', calls.length > 0, function () { return 'Expected number of calls: ' + (negated ? '0' : '≥ 1') + '\nReceived number of calls: ' + calls.length; });
        },
        toHaveBeenCalledTimes: function (times) {
          var calls = callsOf('toHaveBeenCalledTimes', 'expected');
          check('toHaveBeenCalledTimes', 'expected', calls.length === times, function () { return 'Expected number of calls: ' + (negated ? 'not ' : '') + preview(times) + '\nReceived number of calls: ' + calls.length; });
        },
        toHaveBeenCalledWith: function () {
          var wantedArgs = [];
          for (var a = 0; a < arguments.length; a++) wantedArgs.push(arguments[a]);
          var calls = callsOf('toHaveBeenCalledWith', '...expected');
          var pass = false;
          for (var c = 0; c < calls.length; c++) if (equal(calls[c], wantedArgs, [])) pass = true;
          check('toHaveBeenCalledWith', '...expected', pass, function () {
            var lines = [];
            for (var k = 0; k < calls.length && k < 5; k++) lines.push('  ' + (k + 1) + ': ' + preview(calls[k]));
            return 'Expected: ' + (negated ? 'not ' : '') + preview(wantedArgs) + '\nReceived: ' + (calls.length ? '\n' + lines.join('\n') : 'no calls') + '\n\nNumber of calls: ' + calls.length;
          });
        },
        toMatchInlineSnapshot: function (snapshot) {
          if (typeof snapshot !== 'string') refuse('toMatchInlineSnapshot', 'snapshot', 'This runner needs the snapshot written in the test.');
          var text = typeof actual === 'string' ? actual : preview(actual);
          var expected = dedent(snapshot);
          check('toMatchInlineSnapshot', 'snapshot', text === expected, function () {
            return 'Snapshot:\n' + block(cut(expected, limits.maxMessage / 2)) + '\n\nReceived:\n' + block(cut(text, limits.maxMessage / 2));
          });
        }
      };
    };
    var matchers = make(false);
    matchers.not = make(true);
    return matchers;
  };

  /* vi.spyOn's methods to put back after the running test. */
  var spies = [];
  var restoreSpies = function () {
    while (spies.length) {
      var undo = spies.pop();
      try { undo(); } catch (error) { /* a frozen object: nothing to put back */ }
    }
  };
  var makeMock = function (implementation) {
    var impl = typeof implementation === 'function' ? implementation : null;
    var state = { calls: [], results: [] };
    var mock = function () {
      var args = [];
      for (var i = 0; i < arguments.length; i++) args.push(arguments[i]);
      state.calls.push(args);
      var value = impl ? impl.apply(this, args) : undefined;
      state.results.push(value);
      return value;
    };
    mocks.add(mock);
    mock.mock = state;
    mock.mockReturnValue = function (value) { impl = function () { return value; }; return mock; };
    mock.mockImplementation = function (fn) { impl = typeof fn === 'function' ? fn : null; return mock; };
    mock.mockRestore = function () { /* only a spy has something to put back */ };
    return mock;
  };
  var vi = {
    fn: function (implementation) { return makeMock(implementation); },
    spyOn: function (object, name) {
      if (object === null || (typeof object !== 'object' && typeof object !== 'function') || typeof object[name] !== 'function') {
        throw new NativeError('vi.spyOn: ' + toText(name) + ' is not a method of ' + preview(object));
      }
      var original = object[name];
      var spy = makeMock(original);
      var restore = function () { object[name] = original; };
      spy.mockRestore = restore;
      object[name] = spy;
      spies.push(restore);
      return spy;
    }
  };

  /* The registered tests, in order: { file, name, fn, at (the stack where test() was called) }. */
  var tests = [];
  var dropped = 0;
  var file = null;
  var test = function (name, fn) {
    if (tests.length >= limits.maxTests) {
      dropped++;
      return;
    }
    var at = '';
    try { at = cut(new NativeError('test').stack || '', limits.maxStack); } catch (error) { at = ''; }
    tests.push({ file: file, name: cut(name, limits.maxName), fn: fn, at: at });
  };

  /* A thrown value as plain data: an error's name, message and stack (cut), or what was thrown, printed. */
  var describe = function (error) {
    try {
      if (error !== null && typeof error === 'object' && typeof error.message === 'string') {
        var name = typeof error.name === 'string' ? cut(error.name, 100) : null;
        var stack = typeof error.stack === 'string' ? cut(error.stack, limits.maxStack) : null;
        return { name: name, message: cut(error.message, limits.maxMessage), stack: stack };
      }
    } catch (failed) { /* a getter that throws: print the value instead */ }
    return { name: null, message: cut('Thrown: ' + preview(error), limits.maxMessage), stack: null };
  };

  var run = function (from, onStart, onResult, onDone) {
    var index = from;
    var next = function () {
      if (index >= tests.length) {
        onDone(dropped);
        return;
      }
      var at = index++;
      var entry = tests[at];
      var record = { checks: 0 };
      current = record;
      onStart(at, entry);
      var settled = false;
      var finish = function (ok, error) {
        if (settled) return;
        settled = true;
        restoreSpies();
        if (current === record) current = null;
        onResult(at, entry, ok ? { ok: true, checks: record.checks, error: null } : { ok: false, checks: record.checks, error: describe(error) });
        later(next, 0);
      };
      try {
        if (typeof entry.fn !== 'function') throw new NativeError('test() needs a function as its second argument');
        var value = entry.fn();
        if (value !== null && (typeof value === 'object' || typeof value === 'function') && typeof value.then === 'function') {
          value.then(function () { finish(true, null); }, function (error) { finish(false, error); });
        } else {
          finish(true, null);
        }
      } catch (error) {
        finish(false, error);
      }
    };
    next();
  };

  return {
    test: test,
    expect: expect,
    vi: vi,
    setFile: function (path) { file = path; },
    count: function () { return tests.length; },
    describe: describe,
    run: run
  };
})`

/**
 * The worker the frame starts for a run (a classic worker from a blob URL: a module worker can't start in a sealed
 * frame's opaque origin, a classic one can `import()` the blob modules). Its first message gives it the config and its
 * own port; it keeps the port in its closure and stops listening, so nothing the tests run can post to the frame as the
 * runner. It puts `test`, `it`, `expect` and `vi` on the global scope, imports the test files one by one (reporting
 * `loading` before each and `file` after it, with how many tests it registered or why it could not load), then runs the
 * tests from `from` (`start` before each, `test` after it) and says `done`.
 */
export const TEST_WORKER_SOURCE = String.raw`(function () {
  'use strict';
  var create = ${TEST_RUNNER_SOURCE};
  self.onmessage = function (event) {
    self.onmessage = null;
    var port = event.ports && event.ports[0];
    var config = event.data;
    if (!port || !config) return;
    var send = port.postMessage.bind(port);
    var post = function (message) {
      try { send(message); } catch (error) { /* only plain data is posted */ }
    };
    var runner = create(config.limits);
    self.test = runner.test;
    self.it = runner.test;
    self.expect = runner.expect;
    self.vi = runner.vi;
    var files = config.files;
    var at = 0;
    var started = function (index, entry) {
      post({ kind: 'start', index: index, file: entry.file, name: entry.name, at: entry.at });
    };
    var reported = function (index, entry, result) {
      post({ kind: 'test', index: index, file: entry.file, name: entry.name, at: entry.at, ok: result.ok, checks: result.checks, error: result.error });
    };
    var load = function () {
      if (at >= files.length) {
        runner.run(config.from, started, reported, function (dropped) { post({ kind: 'done', dropped: dropped }); });
        return;
      }
      var file = files[at++];
      var before = runner.count();
      post({ kind: 'loading', path: file[0] });
      runner.setFile(file[0]);
      import(file[1]).then(function () {
        post({ kind: 'file', path: file[0], count: runner.count() - before, error: null });
        load();
      }, function (error) {
        post({ kind: 'file', path: file[0], count: runner.count() - before, error: runner.describe(error) });
        load();
      });
    };
    load();
  };
})();`
