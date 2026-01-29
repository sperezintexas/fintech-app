yahoo-finance2 v3 requires instantiating the class.

since im haveing issues with yahoo api limits, lets plan and revert to using yahooQuery instead of yahoo for the api calls
remove the rate limited on the dashboard is not longer neeeed

throughout the entire application make sure to use yahooQuery vs yahoo api's
remove all api rate limits
Updating the SmartXAI report route to use Yahoo Finance:
Improving the Yahoo Finance implementation to fetch full OHLC data.

can u run and add test for each page/service happy path only with mocked data unit type test

on the main dashboard , just above "Here's how your portfolio is performing as of xx(datetime)"
please add a market close indicator, and a small chart if indicator for the
S&P, Dow 30, and Nasdaq

ok on the main page, i want to rename the watchlist page label and call it Automation
ensure watchlist is renamed to automationpage


on the positions pages,
- for a stock/option if avail want to + add  unit cost
also the value displayed is the cost basis, can u add the current value based on today's prices, using batch mode for all positions in this account

- please rename  add an acction , to add this position to watchlist
- the cost basis and current value shoudl be calclated diffrently since its an option


then on the automation (old watch list)
add a tab after alter settings and call it scheduled jobs, notication

the schedule job tab/page will allow the user to configure jobs , schedule and job type (watchlist report)
other report types will be supported for now ony watchlist report

the watch list and alerts will only support the followign types of delivery channels, browser push, slack and x twitter.

this watchlistreport will provide a concise (choose message template like alert settings)
01/27/26

on the automation page -> alert settings -> Alert Delivery Channels , please add a test button "Zolton Say's Hello from the Future"
so i can validate the post to x using my atxbogart app

automation -> schedule job, notification,
this should be named 'Manage Jobs'
also a preview button before create schedule job

ok now i want a new job types;

- portfolioReport this report will give a concise portfolo value summary total and by account name risk level, value , % change if availale, create a  snapshot in mongodb as needed, along with market snapshot outlook
- pruneHistory - will prune all snapshop data to preseve data

01/29/26

on the CSP page please
