import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const ts = createRequire(import.meta.url)('typescript');
const source = readFileSync(new URL('./boutique-page.tsx', import.meta.url), 'utf8');
const file = ts.createSourceFile('boutique-page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const page = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'BoutiquePage');
const quoteEffect = page.body.statements.find(node =>
  ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) &&
  node.expression.expression.getText(file) === 'useEffect' &&
  node.expression.arguments[0].getText(file).includes('createShopQuote('),
).expression;
const stateDeclarations = page.body.statements.filter(node =>
  ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration =>
    ts.isArrayBindingPattern(declaration.name) &&
    ['quote', 'quoteRetry'].includes(declaration.name.elements[0].name.getText(file)),
  ),
);
let retryHandler;
function findRetry(node) {
  if (ts.isJsxOpeningElement(node) && node.tagName.getText(file) === 'button') {
    const attributes = node.attributes.properties;
    if (attributes.some(attribute => attribute.name?.getText(file) === 'className' && attribute.initializer?.text === 'bt-retry')) {
      retryHandler = attributes.find(attribute => attribute.name?.getText(file) === 'onClick').initializer.expression;
    }
  }
  ts.forEachChild(node, findRetry);
}
findRetry(page);
assert.ok(retryHandler, 'The real Retry button must be present');

// Execute the actual effect, its dependencies and button handler in isolation.
// Only the hook state, timers and quote request are simulated; no network or DB.
function harness(outcomes) {
  const states = [];
  const timers = new Map();
  const requests = [];
  let hookIndex = 0;
  let timerId = 0;
  let previousDependencies;
  let cleanup;
  const context = vm.createContext({
    country: 'FR',
    quotable: [{ productId: 'fixture', variantId: 'fixture', quantity: 1 }],
    quoteKey: 'unchanged-country-and-cart',
    quoteSeq: { current: 0 },
    useState(initial) {
      const index = hookIndex++;
      if (!(index in states)) states[index] = initial;
      return [states[index], update => {
        states[index] = typeof update === 'function' ? update(states[index]) : update;
      }];
    },
    window: {
      setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
      clearTimeout(id) { timers.delete(id); },
    },
    createShopQuote(input) {
      requests.push(JSON.parse(JSON.stringify(input)));
      const outcome = outcomes[requests.length - 1];
      return outcome instanceof Error
        ? Promise.reject(outcome)
        : Promise.resolve(outcome);
    },
  });
  function evaluate(code) {
    const compiled = ts.transpileModule(code, {
      compilerOptions: { target: ts.ScriptTarget.ES5 },
    }).outputText;
    return vm.runInContext(compiled, context);
  }
  function render() {
    hookIndex = 0;
    evaluate(stateDeclarations.map(node => node.getText(file)).join('\n'));
    const dependencies = evaluate(`(${quoteEffect.arguments[1].getText(file)})`);
    if (!previousDependencies || dependencies.some((value, index) => !Object.is(value, previousDependencies[index]))) {
      cleanup?.();
      previousDependencies = dependencies;
      cleanup = evaluate(`(${quoteEffect.arguments[0].getText(file)})`)();
    }
  }
  return {
    render,
    clickRetry() { evaluate(`(${retryHandler.getText(file)})`)(); render(); },
    async flush() {
      for (const [id, callback] of [...timers]) { timers.delete(id); callback(); }
      await new Promise(resolve => setImmediate(resolve));
      render();
    },
    requests,
    get quote() { return states[0]; },
  };
}

test('Retry sends a second quote request with unchanged cart and country', async () => {
  const h = harness([new Error('Simulated quote failure'), { totalCents: 1500 }]);
  h.render();
  await h.flush();
  assert.equal(h.quote.state, 'error');
  h.clickRetry();
  await h.flush();
  assert.equal(h.requests.length, 2);
  assert.deepEqual(h.requests[1], h.requests[0]);
  assert.equal(h.quote.state, 'ok');
  assert.equal(h.quote.data.totalCents, 1500);
});

test('A second failure remains retryable without changing the cart', async () => {
  const h = harness([new Error('First failure'), new Error('Second failure'), { totalCents: 1500 }]);
  h.render();
  await h.flush();
  h.clickRetry();
  await h.flush();
  assert.equal(h.quote.state, 'error');
  assert.equal(h.requests.length, 2);
  h.clickRetry();
  await h.flush();
  assert.equal(h.requests.length, 3);
  assert.equal(h.quote.state, 'ok');
});

test('Rerendering after failure does not retry automatically', async () => {
  const h = harness([new Error('Simulated quote failure')]);
  h.render();
  await h.flush();
  h.render();
  await h.flush();
  assert.equal(h.requests.length, 1);
  assert.equal(h.quote.state, 'error');
});
