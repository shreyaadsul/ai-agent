import { MongoClient } from "mongodb";

export const db = async ({uri, db_name, collection_name, type='find', param={}})=> {
    const client = await MongoClient.connect(uri);
    const db = client.db(db_name);
    const collection = db.collection(collection_name);
    let data = null
    switch(type) {
        case 'find':
            data = await collection.find(param).toArray();
            break;
        case 'findById':
            data = await collection.findOne(param);
            break;
        case 'aggrigation':
            data = await collection.aggregate(param).toArray();
            break;
        case 'insert':
            data = await collection.insertOne(param);
            break;
        case 'count':
            data = await collection.aggregate(
                [
                    {
                      "$lookup": {
                        "from": "employees",
                        "let": { "pidStr": { "$toString": "$_id" } },
                        "pipeline": [
                          {
                            "$match": {
                              "$expr": {
                                "$eq": [ "$companyId", "$$pidStr" ]
                              }
                            }
                          }
                        ],
                        "as": "emp_data"
                      }
                    },
                    {
                      "$addFields": {
                        "emp_count": { "$size": "$emp_data" }
                      }
                    },
                     {
                      "$project": {
                        "emp_data": 0
                      }
                    }
                  ]
            ).toArray();
            break;
        case 'last_record':
            data = await collection.aggregate(
              [
                {
                  $group: {
                    _id: "$employeeId",
                    lastrecord: {
                      $last: {
                        $dateToString: {
                          format: "%Y-%m-%d",
                          date: "$checkInTime"
                        }
                      }
                    }
                  }
                }
              ]
              
            ).toArray();
            break;
        default:
            data = null
            break;
    }
    client.close()
    return data
}
