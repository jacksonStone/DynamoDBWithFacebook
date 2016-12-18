const express = require('express'),
  https = require('https'),
  fs = require('fs'),
  aws = require('aws-sdk');
  
const credentials = JSON.parse(fs.readFileSync('credentials.json', 'UTF-8')),
  awsSecretKey = credentials.amazon.AWSSecretKey,
  awsAccessKeyId = credentials.amazon.AWSAccessKeyId,
  facebookSecret = credentials.facebook.secret,
  facebookClient = credentials.facebook.client,
  //AWS requires a credentials object when creating any of its API objects.
  //If none is included, it will check in ~/.aws/credentials for your access key and secret key
  awsCreds = new aws.Credentials(awsAccessKeyId, awsSecretKey);
  DynamoDB = new aws.DynamoDB({
    credentials:awsCreds, 
    apiVersion: '2012-08-10',
    //This will need to be set to your particular region
    region: 'us-east-1',
  });
  app = express();

//Express Setup
app.set('view engine', 'pug');
app.get('/', function (req, res) {
  res.render('index');
});
app.get('/comments', function(req,res){
  //Scan gets a list of all items in a table (assuming your table has under 1Mb of data, otherwise you'll need to
  //paginate)
  DynamoDB.scan({'TableName':'Posts'}, (err, data) => {
    if(err){
      return res.end();
    }
    res.send(data);
  });
});
//Listening for a new comment
app.post('/comment', function(req,res){
  req.on('data', function(reqBody){
    //reqBody now contains the body of the ajax.post sent in postMessage function in views/index.pug
    const body = JSON.parse(reqBody+''),
      requestToken =  body.token,
      msg = body.message;
      
    if(!requestToken || !msg) return res.end();
  //Check that they have actually logged into facebook, before you allow them to comment
    verify_facebook_token(requestToken, function(verifiedData){
      if(!verifiedData.id) {return;}
      //Format the item the way Dynamo Expects.
      let newItem = {
        //The "S" means that I want to create a field 'message' with a string value, populated by my msg variable.
        message:{'S':msg}, 
        userId:{'S':verifiedData.id},
        userName:{'S':verifiedData.name},
        //"N" is for number 
        //(full list of types: http://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_AttributeValue.html)
        createdDateTime:{'N':Date.now()+''},
        pictureUrl:{'S':verifiedData.picture.data.url}
      };
      let putRequest = {
        TableName:'Posts',
        Item:newItem
      };
      //This inserts the item. Or if the key value already exists in the Table, it will update the value.
      //Docs here: http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB.html#putItem-property
      DynamoDB.putItem(putRequest, (err, data) => {
        if(err){
          return res.end();
        }
        res.send(data);
      });
    });
  });
});

function verify_facebook_token(token, callback) {
  let debugger_url =   {
    host: 'graph.facebook.com',
    path: '/v2.8/me?fields=id,name,email,picture&access_token='+token
  };
  function after_recieved_response(response){
    
    response.setEncoding('utf8');
    response.on('data', function(d){
      var data = JSON.parse(d);
      callback(data);
    });
  }  
  https.get(debugger_url, after_recieved_response);
}

//Handle Oauth2 flow for Facebook
app.get('/oauth', function(req,res){
  let token_URL =   {
    host: 'graph.facebook.com',
    path: '/v2.8/oauth/access_token?'+
      'client_id=' + facebookClient +
      '&client_secret=' + facebookSecret +
      '&redirect_uri=http://localhost:1337/oauth' +
      '&code=' + req.query.code
  };
  function after_recieved_token(response){
    
    response.setEncoding('utf8');
    response.on('data', function(d){
      d = JSON.parse(d);
      res.redirect('/?access_token='+d.access_token);
    });
  }  
  https.get(token_URL, after_recieved_token);
});

app.listen(1337, function () {
  console.log('Example app listening on port 1337!');
});