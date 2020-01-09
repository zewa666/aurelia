import { Unparser } from '@aurelia/debug';
import { IContainer, Registration } from '@aurelia/kernel';
import { Aurelia, CustomElement, IBinding, INode, IScheduler, bindable, customElement, customAttribute } from '@aurelia/runtime';
import { assert, TestContext } from '@aurelia/testing';
import {
  BindingWithBehavior,
  IValidationController,
  IValidationControllerFactory,
  IValidationRules,
  ValidationConfiguration,
  ValidationController,
  ValidationTrigger,
  PropertyRule,
  RangeRule,
  RequiredRule
} from '@aurelia/validation';
import { Spy } from '../Spy';
import { Person, Organization } from './_test-resources';
import { createSpecFunction, TestFunction, TestExecutionContext } from '../util';

describe.only('validate-biniding-behavior', function () {

  class App {
    public person: Person = new Person((void 0)!, (void 0)!);
    public tempController: ValidationController;
    public controller: ValidationController;
    public controller2: ValidationController;
    public controllerSpy: Spy;
    public controller2Spy: Spy;
    public trigger: ValidationTrigger = ValidationTrigger.change;
    public ageMinRule: PropertyRule;
    public tempAgeRule: PropertyRule[] = (void 0)!;
    public org: Organization = new Organization([], void 0);

    public constructor(@IContainer container: IContainer) {
      const factory = container.get(IValidationControllerFactory);
      this.controllerSpy = new Spy();
      this.controller2Spy = new Spy();

      // mocks ValidationControllerFactory#createForCurrentScope
      const controller = this.controller = this.controllerSpy.getMock(factory.create()) as unknown as ValidationController;
      Registration.instance(IValidationController, controller).register(container);

      this.controller2 = this.controller2Spy.getMock(factory.create()) as unknown as ValidationController;

      const rules = container.get(IValidationRules)
        .on(this.person)

        .ensure('name')
        .required()

        .ensure('age')
        .required()
        .min(42)
        .rules;

      const { validationRules: vrs, messageProvider, property, $rules } = rules.find((rule) => rule.property.name === 'age')!;
      this.ageMinRule = new PropertyRule(vrs, messageProvider, property, [[$rules[0].find((rule) => rule instanceof RangeRule)]]);

      container.get(IValidationRules)
        .on(this.org)
        .ensure('employees')
        .minItems(1);
    }
  }

  @customElement({ name: 'text-box', template: `<input value.two-way="value"/>` })
  class TextBox {
    @bindable public value: unknown;
  }
  @customElement({ name: 'employee-list', template: `\${employees.length}` })
  class EmployeeList {
    @bindable public employees: Person[];
  }
  @customAttribute({ name: 'foo-bar' })
  class FooBar {
    public static staticText: string = 'from foo-bar ca';
    @bindable public value: unknown;
    @bindable public triggeringEvents: string[];

    public constructor(@INode private readonly node: HTMLElement) { }

    public beforeBind() {
      for (const event of this.triggeringEvents) {
        this.node.addEventListener(event, this);
      }
    }

    public handleEvent(_event: Event) {
      this.value = FooBar.staticText;
    }
  }
  interface TestSetupContext {
    template: string;
    customDefaultTrigger?: ValidationTrigger;
  }
  async function runTest(
    testFunction: TestFunction<TestExecutionContext<App>>,
    { template, customDefaultTrigger }: TestSetupContext
  ) {
    const ctx = TestContext.createHTMLTestContext();
    const container = ctx.container;
    const host = ctx.dom.createElement('app');
    ctx.doc.body.appendChild(host);
    let app;
    const au = new Aurelia(container);
    await au
      .register(
        customDefaultTrigger
          ? ValidationConfiguration.customize((options) => {
            options.defaultTrigger = customDefaultTrigger;
          })
          : ValidationConfiguration,
        TextBox,
        EmployeeList,
        FooBar
      )
      .app({
        host,
        component: app = (() => {
          const ca = CustomElement.define({ name: 'app', isStrictBinding: true, template }, App);
          return new ca(container);
        })()
      })
      .start()
      .wait();

    await testFunction({ app, container, host });

    await au.stop().wait();
    ctx.doc.body.removeChild(host);
  }

  const $it = createSpecFunction(runTest);

  function assertControllerBinding(controller: ValidationController, rawExpression: string, target: INode, controllerSpy: Spy) {
    controllerSpy.methodCalledTimes('registerBinding', 1);
    const bindings = Array.from((controller['bindings'] as Map<IBinding, any>).keys()) as BindingWithBehavior[];
    assert.equal(bindings.length, 1);

    const binding = bindings[0];
    assert.equal(binding.target, target);
    assert.equal(Unparser.unparse(binding.sourceExpression.expression), rawExpression);
  }

  async function assertEventHandler(target: HTMLElement, event: 'change' | 'blur', callCount: number, scheduler: IScheduler, controllerSpy: Spy) {
    controllerSpy.clearCallRecords();
    target.dispatchEvent(new Event(event));
    await scheduler.yieldAll(10);
    controllerSpy.methodCalledTimes('validateBinding', callCount);
    controllerSpy.methodCalledTimes('validate', callCount);
  }

  // #region trigger
  $it('registers binding to the controller with default **blur** trigger',
    async function ({ app, host, container }: TestExecutionContext<App>) {
      const scheduler = container.get(IScheduler);
      const controller = app.controller;
      const controllerSpy = app.controllerSpy;

      const target: HTMLInputElement = (host as Element).querySelector("#target");
      assertControllerBinding(controller, 'person.name', target, controllerSpy);

      assert.equal(controller.results.filter((r) => !r.valid).length, 0, 'error1');
      await controller.validate();
      assert.equal(controller.results.filter((r) => !r.valid).length, 1, 'error2');

      target.value = 'foo';
      await assertEventHandler(target, 'change', 0, scheduler, controllerSpy);
      await assertEventHandler(target, 'blur', 1, scheduler, controllerSpy);
      assert.equal(controller.results.filter((e) => !e.valid && e.propertyName === 'name').length, 0, 'error3');
    },
    { template: `<input id="target" type="text" value.two-way="person.name & validate">` }
  );

  $it('a default trigger can be registered - **change**',
    async function ({ app, host, container }: TestExecutionContext<App>) {
      const scheduler = container.get(IScheduler);
      const controller = app.controller;
      const controllerSpy = app.controllerSpy;

      const target: HTMLInputElement = (host as Element).querySelector("#target");
      assertControllerBinding(controller, 'person.name', target, controllerSpy);

      assert.equal(controller.results.filter((r) => !r.valid).length, 0, 'error1');
      await controller.validate();
      assert.equal(controller.results.filter((r) => !r.valid).length, 1, 'error2');

      target.value = 'foo';
      await assertEventHandler(target, 'blur', 0, scheduler, controllerSpy);
      await assertEventHandler(target, 'change', 1, scheduler, controllerSpy);
      assert.equal(controller.results.filter((e) => !e.valid && e.propertyName === 'name').length, 0, 'error3');
    },
    { template: `<input id="target" type="text" value.two-way="person.name & validate:'change'">`, customDefaultTrigger: ValidationTrigger.change }
  );

  $it('supports **changeOrBlur** validation trigger',
    async function ({ app, host, container }: TestExecutionContext<App>) {
      const scheduler = container.get(IScheduler);
      const controller = app.controller;
      const controllerSpy = app.controllerSpy;

      const target: HTMLInputElement = (host as Element).querySelector("#target");
      assertControllerBinding(controller, 'person.name', target, controllerSpy);

      await assertEventHandler(target, 'blur', 1, scheduler, controllerSpy);
      assert.equal(controller.results.filter((e) => !e.valid && e.propertyName === 'name').length, 1, 'error3');

      target.value = 'foo';
      await assertEventHandler(target, 'change', 1, scheduler, controllerSpy);
      assert.equal(controller.results.filter((e) => !e.valid && e.propertyName === 'name').length, 0, 'error4');
    },
    { template: `<input id="target" type="text" value.two-way="person.name & validate:'changeOrBlur'">` }
  );

  $it('supports **manual** validation trigger',
    async function ({ app, host, container }: TestExecutionContext<App>) {
      const scheduler = container.get(IScheduler);
      const controller = app.controller;
      const controllerSpy = app.controllerSpy;

      const target: HTMLInputElement = (host as Element).querySelector("#target");
      assertControllerBinding(controller, 'person.name', target, controllerSpy);

      controllerSpy.clearCallRecords();
      assert.equal(controller.results.filter((e) => !e.valid && e.propertyName === 'name').length, 0, 'error1');
      await controller.validate();
      assert.equal(controller.results.filter((e) => !e.valid && e.propertyName === 'name').length, 1, 'error2');

      await assertEventHandler(target, 'blur', 0, scheduler, controllerSpy);
      target.value = 'foo';
      await assertEventHandler(target, 'change', 0, scheduler, controllerSpy);

      controllerSpy.clearCallRecords();
      assert.equal(controller.results.filter((e) => !e.valid && e.propertyName === 'name').length, 1, 'error3');
      await controller.validate();
      assert.equal(controller.results.filter((e) => !e.valid && e.propertyName === 'name').length, 0, 'error4');
    },
    { template: `<input id="target" type="text" value.two-way="person.name & validate:'manual'">` }
  );

  $it('handles changes in dynamically bound trigger value',
    async function ({ app, host, container }: TestExecutionContext<App>) {
      const scheduler = container.get(IScheduler);
      const controller = app.controller;
      const controllerSpy = app.controllerSpy;

      const target: HTMLInputElement = (host as Element).querySelector("#target");
      assertControllerBinding(controller, 'person.name', target, controllerSpy);

      assert.equal(app.trigger, ValidationTrigger.change);
      target.value = 'foo';
      await assertEventHandler(target, 'change', 1, scheduler, controllerSpy);
      await assertEventHandler(target, 'blur', 0, scheduler, controllerSpy);

      app.trigger = ValidationTrigger.blur;
      await assertEventHandler(target, 'blur', 1, scheduler, controllerSpy);
      target.value = 'bar';
      await assertEventHandler(target, 'change', 0, scheduler, controllerSpy);

      app.trigger = ValidationTrigger.changeOrBlur;
      await assertEventHandler(target, 'blur', 1, scheduler, controllerSpy);
      target.value = 'foo';
      await assertEventHandler(target, 'change', 1, scheduler, controllerSpy);

      app.trigger = ValidationTrigger.manual;
      await assertEventHandler(target, 'blur', 0, scheduler, controllerSpy);
      target.value = 'bar';
      await assertEventHandler(target, 'change', 0, scheduler, controllerSpy);
    },
    { template: `<input id="target" type="text" value.two-way="person.name & validate:trigger">` }
  );
  // #endregion

  // #region controller
  $it('respects bound controller',
    async function ({ app, host, container }: TestExecutionContext<App>) {
      const scheduler = container.get(IScheduler);
      const controller = app.controller;
      const controllerSpy = app.controllerSpy;
      const controller2 = app.controller2;
      const controller2Spy = app.controller2Spy;

      const target1: HTMLInputElement = (host as Element).querySelector("#target1");
      const target2: HTMLInputElement = (host as Element).querySelector("#target2");
      assertControllerBinding(controller, 'person.name', target1, controllerSpy);
      assertControllerBinding(controller2, 'person.age', target2, controller2Spy);

      target1.value = 'foo';
      target2.value = '42';
      await assertEventHandler(target1, 'change', 1, scheduler, controllerSpy);
      await assertEventHandler(target2, 'change', 1, scheduler, controller2Spy);
      assert.equal(controller.results.filter((e) => !e.valid && e.propertyName === 'name').length, 0, 'error5');
      assert.equal(controller.results.filter((e) => e.propertyName === 'age').length, 0, 'error6');
      assert.equal(controller2.results.filter((e) => !e.valid && e.propertyName === 'name').length, 0, 'error7');
      assert.equal(controller2.results.filter((e) => e.propertyName === 'name').length, 0, 'error8');
    },
    {
      template: `
    <input id="target1" type="text" value.two-way="person.name & validate:'change'">
    <input id="target2" type="text" value.two-way="person.age & validate:'change':controller2">
    ` }
  );

  $it('handles value change of the bound controller',
    async function ({ app, host, container }: TestExecutionContext<App>) {
      const scheduler = container.get(IScheduler);
      const controller = app.controller;
      const controllerSpy = app.controllerSpy;
      const controller2 = app.controller2;
      const controller2Spy = app.controller2Spy;

      const target1: HTMLInputElement = (host as Element).querySelector("#target1");
      assertControllerBinding(controller, 'person.name', target1, controllerSpy);

      await assertEventHandler(target1, 'blur', 1, scheduler, controllerSpy);
      assert.equal(controller.results.filter((e) => !e.valid && e.propertyName === 'name').length, 1, 'error1');
      assert.equal(controller2.results.filter((e) => !e.valid && e.propertyName === 'name').length, 0, 'error2');

      app.tempController = controller2;
      await scheduler.yieldAll(10);
      controllerSpy.methodCalledTimes('deregisterBinding', 1);
      assertControllerBinding(controller2, 'person.name', target1, controller2Spy);

      await assertEventHandler(target1, 'blur', 1, scheduler, controller2Spy);
      assert.equal(controller.results.filter((e) => !e.valid && e.propertyName === 'name').length, 0, 'error1');
      assert.equal(controller2.results.filter((e) => !e.valid && e.propertyName === 'name').length, 1, 'error2');
    },
    {
      template: `
    <input id="target1" type="text" value.two-way="person.name & validate:'blur':tempController">
    ` }
  );

  $it('handles the trigger-controller combo correctly',
    async function ({ app, host, container }: TestExecutionContext<App>) {
      const scheduler = container.get(IScheduler);
      const controller = app.controller;
      const controllerSpy = app.controllerSpy;
      const controller2 = app.controller2;
      const controller2Spy = app.controller2Spy;

      const target1: HTMLInputElement = (host as Element).querySelector("#target1");
      const target2: HTMLInputElement = (host as Element).querySelector("#target2");
      assertControllerBinding(controller, 'person.name', target1, controllerSpy);
      assertControllerBinding(controller2, 'person.age', target2, controller2Spy);

      await assertEventHandler(target1, 'blur', 1, scheduler, controllerSpy);
      await assertEventHandler(target2, 'blur', 0, scheduler, controller2Spy);
      assert.equal(controller.results.filter((e) => !e.valid && e.propertyName === 'name').length, 1, 'error1');
      assert.equal(controller2.results.filter((e) => !e.valid && e.propertyName === 'age').length, 0, 'error2');

      target1.value = 'foo';
      target2.value = '41';
      await assertEventHandler(target1, 'change', 0, scheduler, controllerSpy);
      await assertEventHandler(target2, 'change', 1, scheduler, controller2Spy);
      assert.equal(controller.results.filter((e) => !e.valid && e.propertyName === 'name').length, 1, 'error3');
      assert.equal(controller2.results.filter((e) => !e.valid && e.propertyName === 'age').length, 1, 'error4');
    },
    {
      template: `
    <input id="target1" type="text" value.two-way="person.name & validate:'blur':controller">
    <input id="target2" type="text" value.two-way="person.age & validate:'change':controller2">
    ` }
  );
  // #endregion

  // #region rules
  $it('respects bound rules',
    async function ({ app, host, container }: TestExecutionContext<App>) {
      const scheduler = container.get(IScheduler);
      const controller = app.controller;
      const controllerSpy = app.controllerSpy;

      const target2: HTMLInputElement = (host as Element).querySelector("#target2");
      assertControllerBinding(controller, 'person.age', target2, controllerSpy);

      target2.value = '41';
      await assertEventHandler(target2, 'change', 1, scheduler, controllerSpy);
      assert.equal(controller.results.filter((e) => e.propertyName === 'age').length, 1, 'error2');

      target2.value = '42';
      await assertEventHandler(target2, 'change', 1, scheduler, controllerSpy);
      assert.equal(controller.results.filter((e) => !e.valid && e.propertyName === 'age').length, 0, 'error3');
    },
    {
      template: `
    <input id="target2" type="text" value.two-way="person.age & validate:'change':controller1:[ageMinRule]">
    ` }
  );

  $it('respects change in value of bound rules',
    async function ({ app, host, container }: TestExecutionContext<App>) {
      const scheduler = container.get(IScheduler);
      const controller = app.controller;
      const controllerSpy = app.controllerSpy;

      const target2: HTMLInputElement = (host as Element).querySelector("#target2");
      assertControllerBinding(controller, 'person.age', target2, controllerSpy);

      target2.value = '41';
      await assertEventHandler(target2, 'change', 1, scheduler, controllerSpy);
      assert.equal(controller.results.filter((e) => !e.valid && e.propertyName === 'age' && e.rule instanceof RangeRule).length, 1, 'error2');
      assert.equal(controller.results.filter((e) => !e.valid && e.propertyName === 'age' && e.rule instanceof RequiredRule).length, 0, 'error3');

      target2.value = '42';
      await assertEventHandler(target2, 'change', 1, scheduler, controllerSpy);
      assert.equal(controller.results.filter((e) => !e.valid && e.propertyName === 'age').length, 0, 'error4');

      app.tempAgeRule = [app.ageMinRule];
      await scheduler.yieldAll();

      target2.value = '';
      await assertEventHandler(target2, 'change', 1, scheduler, controllerSpy);
      assert.equal(controller.results.filter((e) => !e.valid && e.propertyName === 'age' && e.rule instanceof RequiredRule).length, 0, 'error5');

      target2.value = '41';
      await assertEventHandler(target2, 'change', 1, scheduler, controllerSpy);
      assert.equal(controller.results.filter((e) => !e.valid && e.propertyName === 'age' && e.rule instanceof RangeRule).length, 1, 'error6');

      target2.value = '42';
      await assertEventHandler(target2, 'change', 1, scheduler, controllerSpy);
      assert.equal(controller.results.filter((e) => !e.valid && e.propertyName === 'age').length, 0, 'error7');
    },
    {
      template: `
    <input id="target2" type="text" value.two-way="person.age & validate:'change':controller1:tempAgeRule">
    ` }
  );
  // #endregion

  // #region argument parsing
  [
    { args: `'chaos'`, expectedError: 'is not a supported validation trigger' },
    { args: `controller`, expectedError: 'is not a supported validation trigger' },
    { args: `ageMinRule`, expectedError: 'is not a supported validation trigger' },
    { args: `controller:'change'`, expectedError: 'is not a supported validation trigger' },
    { args: `'change':'foo'`, expectedError: 'foo is not of type ValidationController' },
    { args: `'change':{}`, expectedError: 'is not of type ValidationController' },
    { args: `'change':ageMinRule`, expectedError: 'is not of type ValidationController' },
    { args: `'change':controller:ageMinRule:'foo'`, expectedError: 'Unconsumed argument#4 for validate binding behavior: foo' },
  ].map(({ args, expectedError }) =>
    it(`throws error if the arguments are not provided in correct order - ${args}`, async function () {
      const ctx = TestContext.createHTMLTestContext();
      const container = ctx.container;
      const host = ctx.dom.createElement('app');
      const template = `<input id="target2" type="text" value.two-way="person.age & validate:${args}">`;
      ctx.doc.body.appendChild(host);
      const au = new Aurelia(container);
      try {
        await au
          .register(ValidationConfiguration)
          .app({
            host,
            component: (() => {
              const ca = CustomElement.define({ name: 'app', isStrictBinding: true, template }, App);
              return new ca(container);
            })()
          })
          .start()
          .wait();
      } catch (e) {
        assert.equal(e.message.endsWith(expectedError), true);
      }
      await au.stop().wait();
      ctx.doc.body.removeChild(host);
    }));

  // #endregion

  // #region custom element
  $it('can be used with custom element - change trigger',
    async function ({ app, host, container }: TestExecutionContext<App>) {
      const scheduler = container.get(IScheduler);
      const controller = app.controller;
      const controllerSpy = app.controllerSpy;
      const person = app.person;

      const ceHost: HTMLElement = (host as Element).querySelector("#target");
      const input: HTMLInputElement = ceHost.querySelector("input");

      assert.equal(controller.results.filter((r) => !r.valid && r.propertyName === 'name' && r.object === person).length, 0, 'error1');
      await controller.validate();
      assert.equal(controller.results.filter((r) => !r.valid && r.propertyName === 'name' && r.object === person).length, 1, 'error2');

      input.value = 'foo';
      await assertEventHandler(input, 'change', 1, scheduler, controllerSpy);
      assert.equal(controller.results.filter((r) => !r.valid && r.propertyName === 'name' && r.object === person).length, 0, 'error3');
    },
    { template: `<text-box id="target" value.two-way="person.name & validate:'change'"></text-box>` }
  );
  $it('can be used with custom element - blur trigger',
    async function ({ app, host, container }: TestExecutionContext<App>) {
      const scheduler = container.get(IScheduler);
      const controller = app.controller;
      const controllerSpy = app.controllerSpy;
      const person = app.person;

      const ceHost: HTMLElement = (host as Element).querySelector("#target");

      assert.equal(controller.results.filter((r) => !r.valid && r.propertyName === 'name' && r.object === person).length, 0, 'error1');
      await controller.validate();
      assert.equal(controller.results.filter((r) => !r.valid && r.propertyName === 'name' && r.object === person).length, 1, 'error2');

      controllerSpy.clearCallRecords();
      person.name = 'foo';
      await scheduler.yieldAll(10);
      controllerSpy.methodCalledTimes('validateBinding', 0);
      controllerSpy.methodCalledTimes('validate', 0);
      assert.equal(controller.results.filter((r) => !r.valid && r.propertyName === 'name' && r.object === person).length, 1, 'error3');

      controllerSpy.clearCallRecords();
      ceHost.focus();
      await scheduler.yieldAll();
      await assertEventHandler(ceHost, 'blur', 1, scheduler, controllerSpy);
      assert.equal(controller.results.filter((r) => !r.valid && r.propertyName === 'name' && r.object === person).length, 0, 'error4');
    },
    { template: `<text-box tabindex="-1" id="target" value.two-way="person.name & validate:'blur'"></text-box>` }
  );
  $it('can be used with custom element - changeOrBlur trigger',
    async function ({ app, host, container }: TestExecutionContext<App>) {
      const scheduler = container.get(IScheduler);
      const controller = app.controller;
      const controllerSpy = app.controllerSpy;
      const person = app.person;

      const ceHost: HTMLElement = (host as Element).querySelector("#target");
      const input: HTMLInputElement = ceHost.querySelector("input");

      assert.equal(controller.results.filter((r) => !r.valid && r.propertyName === 'name' && r.object === person).length, 0, 'error1');
      await controller.validate();
      assert.equal(controller.results.filter((r) => !r.valid && r.propertyName === 'name' && r.object === person).length, 1, 'error2');

      input.value = 'foo';
      await assertEventHandler(input, 'change', 1, scheduler, controllerSpy);

      controllerSpy.clearCallRecords();
      ceHost.focus();
      await scheduler.yieldAll();
      await assertEventHandler(ceHost, 'blur', 1, scheduler, controllerSpy);
      assert.equal(controller.results.filter((r) => !r.valid && r.propertyName === 'name' && r.object === person).length, 0, 'error4');
    },
    { template: `<text-box tabindex="-1" id="target" value.two-way="person.name & validate:'changeOrBlur'"></text-box>` }
  );
  $it('can be used with custom element - manual trigger',
    async function ({ app, host, container }: TestExecutionContext<App>) {
      const scheduler = container.get(IScheduler);
      const controller = app.controller;
      const controllerSpy = app.controllerSpy;
      const person = app.person;

      const ceHost: HTMLElement = (host as Element).querySelector("#target");
      const input: HTMLInputElement = ceHost.querySelector("input");

      assert.equal(controller.results.filter((r) => !r.valid && r.propertyName === 'name' && r.object === person).length, 0, 'error1');
      await controller.validate();
      assert.equal(controller.results.filter((r) => !r.valid && r.propertyName === 'name' && r.object === person).length, 1, 'error2');

      input.value = 'foo';
      await assertEventHandler(input, 'change', 0, scheduler, controllerSpy);

      controllerSpy.clearCallRecords();
      ceHost.focus();
      await scheduler.yieldAll();
      await assertEventHandler(ceHost, 'blur', 0, scheduler, controllerSpy);
      await controller.validate();
      assert.equal(controller.results.filter((r) => !r.valid && r.propertyName === 'name' && r.object === person).length, 0, 'error4');
    },
    { template: `<text-box tabindex="-1" id="target" value.two-way="person.name & validate:'manual'"></text-box>` }
  );
  // #endregion

  // #region custom attribute
  $it('can be used with custom attribute - change trigger',
    async function ({ app, host, container }: TestExecutionContext<App>) {
      const scheduler = container.get(IScheduler);
      const controller = app.controller;
      const controllerSpy = app.controllerSpy;
      const person = app.person;

      const caHost: HTMLDivElement = (host as Element).querySelector("#target");

      assert.equal(controller.results.filter((r) => !r.valid && r.propertyName === 'name' && r.object === person).length, 0, 'error1');
      await controller.validate();
      assert.equal(controller.results.filter((r) => !r.valid && r.propertyName === 'name' && r.object === person).length, 1, 'error2');

      controllerSpy.clearCallRecords();
      caHost.click();
      await scheduler.yieldAll(10);
      controllerSpy.methodCalledTimes('validateBinding', 1);
      controllerSpy.methodCalledTimes('validate', 1);
      assert.equal(controller.results.filter((r) => !r.valid && r.propertyName === 'name' && r.object === person).length, 0, 'error3');
    },
    { template: `<div id="target" foo-bar="value.two-way:person.name & validate:'change'; triggering-events.bind:['click']"></div>` }
  );
  $it('can be used with custom attribute - blur trigger',
    async function ({ app, host, container }: TestExecutionContext<App>) {
      const scheduler = container.get(IScheduler);
      const controller = app.controller;
      const controllerSpy = app.controllerSpy;
      const person = app.person;

      const caHost: HTMLDivElement = (host as Element).querySelector("#target");

      assert.equal(controller.results.filter((r) => !r.valid && r.propertyName === 'name' && r.object === person).length, 0, 'error1');
      await controller.validate();
      assert.equal(controller.results.filter((r) => !r.valid && r.propertyName === 'name' && r.object === person).length, 1, 'error2');

      controllerSpy.clearCallRecords();
      caHost.focus();
      await scheduler.yieldAll();
      await assertEventHandler(caHost, 'blur', 1, scheduler, controllerSpy);
      assert.equal(controller.results.filter((r) => !r.valid && r.propertyName === 'name' && r.object === person).length, 0, 'error3');
    },
    { template: `<div id="target" tabindex="-1" foo-bar="value.two-way:person.name & validate:'blur'; triggering-events.bind:['blur']"></div>` }
  );
  $it('can be used with custom attribute - changeOrBlur trigger',
    async function ({ app, host, container }: TestExecutionContext<App>) {
      const scheduler = container.get(IScheduler);
      const controller = app.controller;
      const controllerSpy = app.controllerSpy;
      const person = app.person;

      const caHost: HTMLDivElement = (host as Element).querySelector("#target");

      assert.equal(controller.results.filter((r) => !r.valid && r.propertyName === 'name' && r.object === person).length, 0, 'error1');
      await controller.validate();
      assert.equal(controller.results.filter((r) => !r.valid && r.propertyName === 'name' && r.object === person).length, 1, 'error2');

      controllerSpy.clearCallRecords();
      caHost.click();
      await scheduler.yieldAll(10);
      controllerSpy.methodCalledTimes('validateBinding', 1);
      controllerSpy.methodCalledTimes('validate', 1);
      assert.equal(controller.results.filter((r) => !r.valid && r.propertyName === 'name' && r.object === person).length, 0, 'error3');

      controllerSpy.clearCallRecords();
      caHost.focus();
      await scheduler.yieldAll();
      await assertEventHandler(caHost, 'blur', 1, scheduler, controllerSpy);
    },
    { template: `<div id="target" tabindex="-1" foo-bar="value.two-way:person.name & validate:'changeOrBlur'; triggering-events.bind:['click']"></div>` }
  );
  $it('can be used with custom attribute - manual trigger',
    async function ({ app, host, container }: TestExecutionContext<App>) {
      const scheduler = container.get(IScheduler);
      const controller = app.controller;
      const controllerSpy = app.controllerSpy;
      const person = app.person;

      const caHost: HTMLDivElement = (host as Element).querySelector("#target");

      assert.equal(controller.results.filter((r) => !r.valid && r.propertyName === 'name' && r.object === person).length, 0, 'error1');
      await controller.validate();
      assert.equal(controller.results.filter((r) => !r.valid && r.propertyName === 'name' && r.object === person).length, 1, 'error2');

      controllerSpy.clearCallRecords();
      caHost.click();
      await scheduler.yieldAll(10);
      controllerSpy.methodCalledTimes('validateBinding', 0);
      controllerSpy.methodCalledTimes('validate', 0);
      assert.equal(controller.results.filter((r) => !r.valid && r.propertyName === 'name' && r.object === person).length, 1, 'error3');

      controllerSpy.clearCallRecords();
      caHost.focus();
      await scheduler.yieldAll();
      await assertEventHandler(caHost, 'blur', 0, scheduler, controllerSpy);

      await controller.validate();
      assert.equal(controller.results.filter((r) => !r.valid && r.propertyName === 'name' && r.object === person).length, 0, 'error5');
    },
    { template: `<div id="target" tabindex="-1" foo-bar="value.two-way:person.name & validate:'manual'; triggering-events.bind:['click', 'blur']"></div>` }
  );
  // #endregion

  $it.skip('can be used to validate collection',
    async function ({ app, host, container }: TestExecutionContext<App>) {
      const scheduler = container.get(IScheduler);
      const controller = app.controller;
      const controllerSpy = app.controllerSpy;

      const target: HTMLInputElement = (host as Element).querySelector("#target");
      // assertControllerBinding(controller, 'org.employees', target, controllerSpy);

      assert.equal(controller.results.filter((r) => !r.valid && r.propertyName === 'org.employees').length, 0, 'error1');
      await controller.validate();
      assert.equal(controller.results.filter((r) => !r.valid && r.propertyName === 'org.employees').length, 1, 'error2');

      controllerSpy.clearCallRecords();
      app.org.employees.push(app.person);
      await scheduler.yieldAll(10);
      controllerSpy.methodCalledTimes('validateBinding', 1);
      controllerSpy.methodCalledTimes('validate', 1);

      // await controller.validate();
      assert.equal(controller.results.filter((r) => !r.valid && r.propertyName === 'org.employees').length, 0, 'error3');
    },
    { template: `<employee-list id="target" employees.bind="org.employees & validate:'change'"></employee-list>` }
  );
});
