import { DI, Class } from '@aurelia/kernel';
import {
  ValidationConfiguration,
  IValidator,
  StandardValidator,
  PropertyRule,
  IValidateable,
  ValidationResult,
  IValidationRules,
  RegexRule,
  LengthRule,
  RequiredRule,
  SizeRule,
  EqualsRule,
  PropertyAccessor,
  BaseValidationRule
} from '@aurelia/validation';
import { assert } from '@aurelia/testing';
import { Person, Address, Organization } from './_test-resources';

describe.only('IValidator', function () {
  function setup(validator?: Class<IValidator>) {
    const container = DI.createContainer();
    container.register(
      validator
        ? ValidationConfiguration.customize((options) => {
          options.validator = validator;
        })
        : ValidationConfiguration);
    return { sut: container.get(IValidator), container };
  }

  it('registered to Singleton StandardValidator by default', function () {
    const { sut: sut1, container } = setup();
    const sut2 = container.get(IValidator);

    assert.instanceOf(sut1, StandardValidator);
    assert.instanceOf(sut2, StandardValidator);
    assert.equal(Object.is(sut1, sut2), true);
  });

  it('can be registered to Singleton custom validator', function () {
    class CustomValidator implements IValidator {
      public validateProperty(object: IValidateable, propertyName: string, rules?: PropertyRule[]): Promise<ValidationResult[]> {
        throw new Error('Method not implemented.');
      }
      public validateObject(object: IValidateable, rules?: PropertyRule[]): Promise<ValidationResult[]> {
        throw new Error('Method not implemented.');
      }

    }
    const { sut: sut1, container } = setup(CustomValidator);
    const sut2 = container.get(IValidator);

    assert.instanceOf(sut1, CustomValidator);
    assert.instanceOf(sut2, CustomValidator);
    assert.equal(Object.is(sut1, sut2), true);
  });
});

describe.only('StandardValidator', function () {
  function setup() {
    const container = DI.createContainer();
    container.register(ValidationConfiguration);
    return {
      sut: container.get(IValidator),
      validationRules: container.get(IValidationRules),
      container
    };
  }

  function assertValidationResult<T extends BaseValidationRule>(
    result: ValidationResult,
    isValid: boolean,
    propertyName: string,
    obj: any,
    rule: Class<T>,
    message?: string,
  ) {
    assert.equal(result.valid, isValid);
    assert.equal(result.propertyName, propertyName);
    assert.equal(result.message, isValid ? void 0 : message);
    assert.equal(result.object, obj);
    assert.instanceOf(result.rule, rule);
  }

  [
    { title: 'string property', getProperty: () => 'name' as const },
    { title: 'lambda property', getProperty: () => ((o) => o.name) as PropertyAccessor },
  ].map(({ title, getProperty }) =>
    it(`validates all rules by default for an object property - ${title}`, async function () {
      const { sut, validationRules } = setup();
      const message1 = 'message1', message2 = 'message2';
      const obj: Person = new Person('test', (void 0)!, (void 0)!);
      validationRules
        .on(obj)
        .ensure(getProperty() as any)
        .matches(/foo/)
        .withMessage(message1)
        .minLength(42)
        .withMessage(message2);

      let result = await sut.validateProperty(obj, 'name');
      assert.equal(result.length, 2);

      assertValidationResult(result[0], false, 'name', obj, RegexRule, message1);
      assertValidationResult(result[1], false, 'name', obj, LengthRule, message2);

      obj.name = 'foo'.repeat(15);
      result = await sut.validateProperty(obj, 'name');
      assert.equal(result.length, 2);

      assertValidationResult(result[0], true, 'name', obj, RegexRule);
      assertValidationResult(result[1], true, 'name', obj, LengthRule);
    }));

  [
    { title: 'string property', getProperty: () => 'name' as const },
    { title: 'lambda property', getProperty: () => ((o) => o.name) as PropertyAccessor },
  ].map(({ title, getProperty }) =>
    it(`if given, validates only the specific rules for an object property - ${title}`, async function () {
      const { sut, validationRules } = setup();
      const message1 = 'message1', message2 = 'message2';
      const obj: Person = new Person('test', (void 0)!, (void 0)!);
      const rules = validationRules
        .on(obj)
        .ensure(getProperty() as any)
        .matches(/foo/)
        .withMessage(message1)
        .minLength(42)
        .withMessage(message2)
        .rules[0];
      const rule = new PropertyRule(
        rules['validationRules'],
        rules['messageProvider'],
        rules.property,
        [[rules.$rules[0][0]]]);

      let result = await sut.validateProperty(obj, 'name', [rule]);
      assert.equal(result.length, 1);

      assertValidationResult(result[0], false, 'name', obj, RegexRule, message1);

      obj.name = 'foo';
      result = await sut.validateProperty(obj, 'name', [rule]);
      assert.equal(result.length, 1);

      assertValidationResult(result[0], true, 'name', obj, RegexRule);
    }));

  [
    {
      title: 'string property',
      getProperty1: () => 'name' as const,
      getProperty2: () => 'age' as const,
      getProperty3: () => 'address.line1' as const
    },
    {
      title: 'lambda property',
      getProperty1: () => ((o) => o.name) as PropertyAccessor,
      getProperty2: () => ((o) => o.age) as PropertyAccessor,
      getProperty3: () => ((o) => o.address.line1) as PropertyAccessor,
    },
  ].map(({ title, getProperty1, getProperty2, getProperty3 }) =>
    it(`validates all rules by default for an object - ${title}`, async function () {
      const { sut, validationRules } = setup();
      const message1 = 'message1', message2 = 'message2';
      const obj: Person = new Person((void 0)!, (void 0)!, { line1: 'invalid' } as any as Address);
      validationRules
        .on(obj)

        .ensure(getProperty1() as any)
        .required()
        .withMessage(message1)

        .ensure(getProperty2() as any)
        .required()
        .withMessage(message2)

        .ensure(getProperty3() as any)
        .matches(/foo/)
        .withMessage("\${$value} does not match pattern");

      let result = await sut.validateObject(obj);
      assert.equal(result.length, 3);

      assertValidationResult(result[0], false, 'name', obj, RequiredRule, message1);
      assertValidationResult(result[1], false, 'age', obj, RequiredRule, message2);
      assertValidationResult(result[2], false, 'address.line1', obj, RegexRule, 'invalid does not match pattern');

      obj.name = 'foo';
      obj.age = 42;
      obj.address.line1 = 'foo';
      result = await sut.validateObject(obj);
      assert.equal(result.length, 3);

      assertValidationResult(result[0], true, 'name', obj, RequiredRule);
      assertValidationResult(result[1], true, 'age', obj, RequiredRule);
      assertValidationResult(result[2], true, 'address.line1', obj, RegexRule);
    }));

  [
    {
      title: 'string property',
      getProperty1: () => 'name' as const,
      getProperty2: () => 'age' as const,
      getProperty3: () => 'address.line1' as const
    },
    {
      title: 'lambda property',
      getProperty1: () => ((o) => o.name) as PropertyAccessor,
      getProperty2: () => ((o) => o.age) as PropertyAccessor,
      getProperty3: () => ((o) => o.address.line1) as PropertyAccessor,
    },
  ].map(({ title, getProperty1, getProperty2 }) =>
    it(`if given, validates only the specific rules for an object - ${title}`, async function () {
      const { sut, validationRules } = setup();
      const message1 = 'message1', message2 = 'message2';
      const obj: Person = new Person((void 0)!, (void 0)!, (void 0)!);
      const rules = validationRules
        .on(obj)

        .ensure(getProperty1() as any)
        .required()
        .withMessage(message1)

        .ensure(getProperty2() as any)
        .required()
        .withMessage(message2)

        .rules;

      let result = await sut.validateObject(obj, [rules[0]]);
      assert.equal(result.length, 1);

      assertValidationResult(result[0], false, 'name', obj, RequiredRule, message1);

      obj.name = 'foo';
      result = await sut.validateObject(obj, [rules[0]]);
      assert.equal(result.length, 1);

      assertValidationResult(result[0], true, 'name', obj, RequiredRule);
    }));

  [
    {
      title: 'string property',
      getProperty1: () => 'employees' as const,
    },
    {
      title: 'lambda property',
      getProperty1: () => ((o) => o.employees) as PropertyAccessor,
    },
  ].map(({ title, getProperty1 }) =>
    it(`can validate collection - ${title}`, async function () {
      const { sut, validationRules } = setup();
      const message1 = 'message1';
      const obj: Organization = new Organization([], (void 0)!);
      validationRules
        .on(obj)

        .ensure(getProperty1() as any)
        .minItems(1)
        .withMessage(message1);

      let result = await sut.validateObject(obj);
      assert.equal(result.length, 1);

      assertValidationResult(result[0], false, 'employees', obj, SizeRule, message1);

      obj.employees.push(new Person((void 0)!, (void 0)!, (void 0)!));
      result = await sut.validateObject(obj);
      assert.equal(result.length, 1);

      assertValidationResult(result[0], true, 'employees', obj, SizeRule);
    }));

  [
    {
      title: 'string property',
      getProperty1: () => 'coll[0].a' as const,
      getProperty2: () => 'coll[1].a' as const,
    },
    {
      title: 'lambda property',
      getProperty1: () => ((o) => o.coll[0].a) as PropertyAccessor,
      getProperty2: () => ((o) => o.coll[1].a) as PropertyAccessor,
    },
  ].map(({ title, getProperty1, getProperty2 }) =>
    it(`can validate collection by index - ${title}`, async function () {
      const { sut, validationRules } = setup();
      const message1 = 'message1', message2 = 'message2';
      const obj = { coll: [{ a: 1 }, { a: 2 }] };
      validationRules
        .on(obj)

        .ensure(getProperty1() as any)
        .equals(11)
        .withMessage(message1)

        .ensure(getProperty2() as any)
        .equals(11)
        .withMessage(message2);

      let result = await sut.validateObject(obj);
      assert.equal(result.length, 2);

      assertValidationResult(result[0], false, 'coll[0].a', obj, EqualsRule, message1);
      assertValidationResult(result[1], false, 'coll[1].a', obj, EqualsRule, message2);

      obj.coll[0].a = 11;
      obj.coll[1].a = 11;
      result = await sut.validateObject(obj);
      assert.equal(result.length, 2);

      assertValidationResult(result[0], true, 'coll[0].a', obj, EqualsRule);
      assertValidationResult(result[1], true, 'coll[1].a', obj, EqualsRule);
    }));
  [
    { title: 'string property', getProperty1: () => 'subprop[\'a\']' as const },
    { title: 'lambda property', getProperty1: () => ((o) => o.subprop['a']) as PropertyAccessor },
  ].map(({ title, getProperty1 }) =>
    it(`can validate indexed property - ${title}`, async function () {
      const { sut, validationRules } = setup();
      const message1 = 'message1';
      const obj = { subprop: { a: 1 } };
      validationRules
        .on(obj)

        .ensure(getProperty1() as any)
        .equals(11)
        .withMessage(message1);

      let result = await sut.validateObject(obj);
      assert.equal(result.length, 1);

      assertValidationResult(result[0], false, 'subprop[\'a\']', obj, EqualsRule, message1);

      obj.subprop.a = 11;
      result = await sut.validateObject(obj);
      assert.equal(result.length, 1);

      assertValidationResult(result[0], true, 'subprop[\'a\']', obj, EqualsRule);
    }));
});