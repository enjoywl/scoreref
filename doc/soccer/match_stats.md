

## 比赛统计信息


**接口地址**:`/v2/api/soccer/match/stats`


**请求方式**:`GET`


**请求数据类型**:`application/x-www-form-urlencoded`


**响应数据类型**:`application/json`


**接口描述**:<p>获取赛事统计信息</p>



**请求参数**:


**请求参数**:


| 参数名称 | 参数说明 | 请求类型    | 是否必须 | 数据类型 | schema |
| -------- | -------- | ----- | -------- | -------- | ------ |
|matchId||query|true|string||


**响应状态**:


| 状态码 | 说明 | schema |
| -------- | -------- | ----- | 
|200|OK|ApiResponseSFSoccerMatchStatisticsVO|
|400|Bad Request|ApiResponseObject|
|500|Internal Server Error|ApiResponseObject|


**响应状态码-200**:


**响应参数**:


| 参数名称 | 参数说明 | 类型 | schema |
| -------- | -------- | ----- |----- | 
|code||integer(int32)|integer(int32)|
|message||string||
|data||SFSoccerMatchStatisticsVO|SFSoccerMatchStatisticsVO|
|&emsp;&emsp;statistics|阶段统计|array|PeriodStatistic|
|&emsp;&emsp;&emsp;&emsp;period|阶段: ALL, 1ST, 2ND, ET1, ET2|string||
|&emsp;&emsp;&emsp;&emsp;groups|统计分组|array|StatGroup|
|&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;groupName|分组名称|string||
|&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;statisticsItems|统计项|array|StatisticItem|
|&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;name|统计项名称|string||
|&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;home|主队值|string||
|&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;away|客队值|string||
|&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;compareCode|比较代码|integer||
|&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;statisticsType|统计类型|string||
|&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;valueType|值类型|string||
|&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;homeValue|主队数值|number||
|&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;awayValue|客队数值|number||
|&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;homeTotal|主队总数|integer||
|&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;awayTotal|客队总数|integer||
|&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;renderType|渲染类型|integer||
|&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;key|唯一标识|string||
|requestId||string||
|timestamp||string(date-time)|string(date-time)|


**响应示例**:
```javascript
{
	"code": 0,
	"message": "",
	"data": {
		"statistics": [
			{
				"period": "",
				"groups": [
					{
						"groupName": "",
						"statisticsItems": [
							{
								"name": "",
								"home": "",
								"away": "",
								"compareCode": 0,
								"statisticsType": "",
								"valueType": "",
								"homeValue": 0,
								"awayValue": 0,
								"homeTotal": 0,
								"awayTotal": 0,
								"renderType": 0,
								"key": ""
							}
						]
					}
				]
			}
		]
	},
	"requestId": "",
	"timestamp": ""
}
```


**响应状态码-400**:


**响应参数**:


| 参数名称 | 参数说明 | 类型 | schema |
| -------- | -------- | ----- |----- | 
|code||integer(int32)|integer(int32)|
|message||string||
|data||object||
|requestId||string||
|timestamp||string(date-time)|string(date-time)|


**响应示例**:
```javascript
{
	"code": 0,
	"message": "",
	"data": {},
	"requestId": "",
	"timestamp": ""
}
```


**响应状态码-500**:


**响应参数**:


| 参数名称 | 参数说明 | 类型 | schema |
| -------- | -------- | ----- |----- | 
|code||integer(int32)|integer(int32)|
|message||string||
|data||object||
|requestId||string||
|timestamp||string(date-time)|string(date-time)|


**响应示例**:
```javascript
{
	"code": 0,
	"message": "",
	"data": {},
	"requestId": "",
	"timestamp": ""
}
```