import { IExpressionParser, BindingType } from "@aurelia/runtime";
import { TestContext, assert } from '@aurelia/testing';
import { Deserializer, Serializer } from '@aurelia/debug';

describe('expression-deserialization', function () {
  function setup() {
    const ctx = TestContext.createHTMLTestContext();
    return ctx.container.get(IExpressionParser);
  }
  it('works for interpolation expression', function () {
    const parser = setup();
    const expr = parser.parse('${prop} static', BindingType.Interpolation);
    assert.deepStrictEqual(Deserializer.deserialize(Serializer.serialize(expr)), expr);
  });
});
