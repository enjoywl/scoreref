

## 比赛基础信息


**接口地址**:`/v2/api/soccer/match/match-info`


**请求方式**:`GET`


**请求数据类型**:`application/x-www-form-urlencoded`


**响应数据类型**:`application/json`


**接口描述**:<p>获取赛事基础信息</p>



**请求参数**:


**请求参数**:


| 参数名称 | 参数说明 | 请求类型    | 是否必须 | 数据类型 | schema |
| -------- | -------- | ----- | -------- | -------- | ------ |
|matchId||query|true|string||


**响应状态**:


| 状态码 | 说明 | schema |
| -------- | -------- | ----- | 
|200|OK|ApiResponseSFSoccerMatchInfoSimpleVO|
|400|Bad Request|ApiResponseObject|
|500|Internal Server Error|ApiResponseObject|


**响应状态码-200**:


**响应参数**:


| 参数名称 | 参数说明 | 类型 | schema |
| -------- | -------- | ----- |----- | 
|code||integer(int32)|integer(int32)|
|message||string||
|data||SFSoccerMatchInfoSimpleVO|SFSoccerMatchInfoSimpleVO|
|&emsp;&emsp;mid|比赛ID|string||
|&emsp;&emsp;ltyp|联赛类型 1:联赛 2:杯赛|integer(int32)||
|&emsp;&emsp;catid|分类ID|string||
|&emsp;&emsp;cty|国家|string||
|&emsp;&emsp;lid|联赛ID|string||
|&emsp;&emsp;lnam|联赛全称|string||
|&emsp;&emsp;lsna|联赛简称|string||
|&emsp;&emsp;lcol|联赛颜色|string||
|&emsp;&emsp;slid|子联赛ID|string||
|&emsp;&emsp;slnam|子联赛名称|string||
|&emsp;&emsp;mtim|比赛预定时间 (unix时间戳)|integer(int32)||
|&emsp;&emsp;htim|上半场或下半场开始时间 (unix时间戳)|integer(int32)||
|&emsp;&emsp;stat|比赛状态 0:未开始 1:上半场 2:中场休息 3:下半场 4:加时赛 5:点球 -1:已结束 -10:取消 -11:待定 -12:终止 -13:中断 -14:延期|integer(int32)||
|&emsp;&emsp;hid|主队ID|string||
|&emsp;&emsp;hnam|主队名称|string||
|&emsp;&emsp;aid|客队ID|string||
|&emsp;&emsp;anam|客队名称|string||
|&emsp;&emsp;hscr|主队比分|integer(int32)||
|&emsp;&emsp;ascr|客队比分|integer(int32)||
|&emsp;&emsp;hhsc|主队上半场比分|integer(int32)||
|&emsp;&emsp;ahsc|客队上半场比分|integer(int32)||
|&emsp;&emsp;hred|主队红牌数|integer(int32)||
|&emsp;&emsp;ared|客队红牌数|integer(int32)||
|&emsp;&emsp;hyel|主队黄牌数|integer(int32)||
|&emsp;&emsp;ayel|客队黄牌数|integer(int32)||
|&emsp;&emsp;hcor|主队角球数|integer(int32)||
|&emsp;&emsp;acor|客队角球数|integer(int32)||
|&emsp;&emsp;hrnk|主队在联赛中的排名|string||
|&emsp;&emsp;arnk|客队在联赛中的排名|string||
|&emsp;&emsp;seas|赛季|string||
|&emsp;&emsp;sid|赛季ID|string||
|&emsp;&emsp;round|联赛轮次或杯赛阶段|string||
|&emsp;&emsp;grps|杯赛小组|string||
|&emsp;&emsp;locn|比赛场地|string||
|&emsp;&emsp;weat|天气|string||
|&emsp;&emsp;temp|温度|string||
|&emsp;&emsp;expl|比赛特殊情况说明|string||
|&emsp;&emsp;extr|加时赛/点球详细信息|ExtraVO|ExtraVO|
|&emsp;&emsp;&emsp;&emsp;koff|开球 1:主队开球 2:客队开球|integer||
|&emsp;&emsp;&emsp;&emsp;mins|比赛常规时间有多少分钟|integer||
|&emsp;&emsp;&emsp;&emsp;hscr|常规时间主队比分|integer||
|&emsp;&emsp;&emsp;&emsp;ascr|常规时间客队比分|integer||
|&emsp;&emsp;&emsp;&emsp;estat|加时赛状态 1:正常比赛加时赛结束 2:特殊比赛加时赛结束 3:比赛在加时赛中|integer||
|&emsp;&emsp;&emsp;&emsp;ehsc|加时赛主队比分|integer||
|&emsp;&emsp;&emsp;&emsp;easc|加时赛客队比分|integer||
|&emsp;&emsp;&emsp;&emsp;phsc|点球主队比分|integer||
|&emsp;&emsp;&emsp;&emsp;pasc|点球客队比分|integer||
|&emsp;&emsp;&emsp;&emsp;thsc|两回合主队总比分|integer||
|&emsp;&emsp;&emsp;&emsp;tasc|两回合客队总比分|integer||
|&emsp;&emsp;&emsp;&emsp;winr|比赛胜者 1:主队 2:客队|integer||
|&emsp;&emsp;line|是否有阵容数据|boolean||
|&emsp;&emsp;neut|是否为中立场地|boolean||
|&emsp;&emsp;injt|上下半场伤停补时长度|integer(int32)||
|&emsp;&emsp;vari|VAR事件|string||
|&emsp;&emsp;uptm|数据更新时间|string||
|&emsp;&emsp;hpc|主队照片|string||
|&emsp;&emsp;apc|客队照片|string||
|&emsp;&emsp;lpc|联赛照片|string||
|&emsp;&emsp;hmgr|主队教练|string||
|&emsp;&emsp;hmid|主队教练ID|string||
|&emsp;&emsp;amgr|客队教练|string||
|&emsp;&emsp;amid|客队教练ID|string||
|&emsp;&emsp;rfee|裁判|string||
|&emsp;&emsp;rfid|裁判ID|string||
|requestId||string||
|timestamp||string(date-time)|string(date-time)|


**响应示例**:
```javascript
{
  "code": 0,
  "message": "",
  "data": {
    "mid": "67890",
    "ltyp": 1,
    "catid": "",
    "cty": "",
    "lid": "1",
    "lnam": "Brazil Serie A",
    "lsna": "BRA D1",
    "lcol": "#9933FF",
    "slid": "1",
    "slnam": "Western Play Off",
    "mtim": 1699999000,
    "htim": 1699999500,
    "stat": 1,
    "hid": "team1",
    "hnam": "Barcelona",
    "aid": "team2",
    "anam": "Real Madrid",
    "hscr": 2,
    "ascr": 1,
    "hhsc": 1,
    "ahsc": 0,
    "hred": 0,
    "ared": 1,
    "hyel": 2,
    "ayel": 3,
    "hcor": 5,
    "acor": 3,
    "hrnk": "1",
    "arnk": "2",
    "seas": "2019-2020",
    "sid": "",
    "round": "10",
    "grps": "A",
    "locn": "Camp Nou",
    "weat": "Clear",
    "temp": "14℃～15℃",
    "expl": "延期",
    "extr": {
      "koff": 1,
      "mins": 90,
      "hscr": 2,
      "ascr": 2,
      "estat": 3,
      "ehsc": 1,
      "easc": 0,
      "phsc": 4,
      "pasc": 3,
      "thsc": 3,
      "tasc": 2,
      "winr": 1
    },
    "line": true,
    "neut": false,
    "injt": 5,
    "vari": "VAR检查",
    "uptm": "2023-11-15 12:00:00",
    "hpc": "http://zq.titan007.com/Image/player/images/1j6en92gab1s.png",
    "apc": "http://zq.titan007.com/Image/player/images/1j6en92gab1s.png?win007=sell",
    "lpc": "http://zq.titan007.com/Image/player/images/1j6en92gab1s.png?win007=sell",
    "hmgr": "",
    "hmid": "",
    "amgr": "",
    "amid": "",
    "rfee": "",
    "rfid": ""
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