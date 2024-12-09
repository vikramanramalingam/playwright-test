const { test,expect,request } = require('@playwright/test');
const { LoginPage } = require('../pages/LoginPage');
const { PageHelper }  = require('../utils/PageHelper');
const { TestDataHelper }  = require('../utils/TestDataHelper');
const { RegisterPage } = require('../pages/RegisterPage');
const { HomePage } = require('../pages/HomePage');
const { AccountsOverview } = require('../pages/AccountsOverview');
const { OpenNewAccount } = require('../pages/OpenNewAccount');
const { TransferFunds } = require('../pages/TransferFunds');
const { BillPay } = require('../pages/BillPay');
const { TransactionsApi } = require('../api/TransactionsApi');

test.describe('End to End tests - Spec', ()=> {

    /** @type {import('@playwright/test').Page} */
    let page;
    let apiRequestContext;
    let loginPage;
    let registerPage;
    let homePage;
    let accountsOverviewPage;
    let openNewAccountPage;
    let transferFundsPage;
    let transactionsApi;
    let userData;
    let newAccountNo;
    let accountBalance;
    let finalAccountBalance;
    let billPay;
    let payeeDetails;
    const TRANSFER_AMOUNT = 10;
    const BILL_AMOUNT = 20;

    test.beforeAll(async ({ browser, baseURL }) => {
        const context = await browser.newContext();
        page = await context.newPage();
        await PageHelper.goTo(page,baseURL);
        loginPage = new LoginPage(page);
        registerPage = new RegisterPage(page);
        homePage = new HomePage(page);
        accountsOverviewPage = new AccountsOverview(page);
        openNewAccountPage = new OpenNewAccount(page);
        transferFundsPage = new TransferFunds(page);
        apiRequestContext = await request.newContext();
        transactionsApi = new TransactionsApi(apiRequestContext);
        billPay = new BillPay(page);

        userData = TestDataHelper.generateUserData();
        // Register a new user
        await loginPage.clickRegisterLink();
        await registerPage.registerNewUser(userData);

    });

    test.afterAll(async ()=> {
        page.close();
        await apiRequestContext.dispose();
    });

    test('Verify user is able to open a new savings account', async () => {

        await test.step('open a new savings account', async () => {
            await homePage.goToOpenNewAccount();
            await openNewAccountPage.openSavingsAccount();
            newAccountNo = await openNewAccountPage.getAccountNumber();
            const accountOpeningMessage = await openNewAccountPage.getAccountOpenedMsg();
            expect(accountOpeningMessage).toEqual("Account Opened!", `Expected account to be opened with message "Account Opened!", but received: ${accountOpeningMessage}`);
        });

        await test.step('Go to accounts overview and verify account number is present', async () => {
            await homePage.goToAccountsOverview();
            accountBalance = await accountsOverviewPage.getAccountBalance(newAccountNo);
            const isAccountPresent = await accountsOverviewPage.verifyAccountNoIsPresent(newAccountNo);
            expect(isAccountPresent).toBe(true, `Expected to find account number ${newAccountNo} in the table, but it was not found.`);
        });

    });

    test('Verify user is able to transfer funds from newly created account to other account', async ()=> {

        await test.step('Transfer funds from the newly created savings account', async () => {
            await homePage.goToTransferFunds();
            await transferFundsPage.transferFunds(TRANSFER_AMOUNT,newAccountNo);
            const transferSuccessMsg = await transferFundsPage.getTransferSuccessMessage();
            expect(transferSuccessMsg).toEqual('Transfer Complete!', `Expected transfer to be successful with "${transferSuccessMsg}" message, but it was not found.`);
        });

        await test.step('Verify account balance is reflecting correct balance after the fund transfer', async () => {
            await homePage.goToAccountsOverview();
            const numericActualBal = parseFloat(accountBalance.replace('$', '').trim());
            finalAccountBalance = numericActualBal - TRANSFER_AMOUNT;
            const currentBal = await accountsOverviewPage.getAccountBalance(newAccountNo);
            const currentBalNumeric = parseFloat(currentBal.replace('$', '').trim());
            expect(currentBalNumeric).toBeCloseTo(finalAccountBalance, 2, `Expected remaining balance to be close to ${finalAccountBalance}, but got ${currentBalNumeric}`);
        });

    });

    test('Verify user is able to pay the bills', async ()=> {

        await test.step('Go to pay bills and pay the bill', async () => {
            payeeDetails = TestDataHelper.generatePayeeData();
            await homePage.goToBillPay();
            await billPay.payBill(payeeDetails, BILL_AMOUNT, newAccountNo );
            const successMsg = await billPay.getBillPaidSuccessMessage();
            expect(successMsg).toEqual('Bill Payment Complete', `Expected transfer to be successful with "${successMsg}" message, but it was not found.`);
        });

        await test.step('Verify account balance is reflecting correct balance after the bill is paid', async () => {
            await homePage.goToAccountsOverview();
            const expectedBal = finalAccountBalance - BILL_AMOUNT;
            const currentBal = await accountsOverviewPage.getAccountBalance(newAccountNo);
            const currentBalNumeric = parseFloat(currentBal.replace('$', '').trim());
            expect(currentBalNumeric).toBeCloseTo(expectedBal, 2, `Expected remaining balance to be close to ${expectedBal}, but got ${currentBalNumeric}`);
        });

        await test.step('verify the bill payment by making call to transaction api', async () => {
            var response = await transactionsApi.getTransactionsByAmount(newAccountNo,BILL_AMOUNT);
            const responseBody = await response.json();
            console.log("the response body is" + JSON.stringify(responseBody));
            expect(response.status()).toBe(200);
            expect(responseBody[0]['accountId'].toString()).toEqual(newAccountNo);
            expect(responseBody[0]['amount']).toEqual(BILL_AMOUNT);
            expect(responseBody[0]['description']).toEqual('Bill Payment to ' + `${payeeDetails.firstName}`);
        });

    });

});