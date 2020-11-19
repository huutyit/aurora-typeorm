import * as AWSLambda from "aws-lambda";
import * as AuroraDataAPI from "aurora-data-api";
import * as createError from "http-errors";
import * as yup from "yup";
import {
  getConnectionManager,
  Entity,
  Column,
  PrimaryColumn,
  Connection,
  ConnectionOptions,
  DefaultNamingStrategy,
} from "typeorm";
import { RelationLoader } from "typeorm/query-builder/RelationLoader";
import { RelationIdLoader } from "typeorm/query-builder/RelationIdLoader";

@Entity("user")
class User {
  @PrimaryColumn()
  username: string;
  @Column()
  email: string;
  @Column()
  password: string;
}

const CONNECTION_OPTIONS: ConnectionOptions = {
  type: "aurora-data-api-pg",
  database: "my-app",
  secretArn: "arn:aws:secretsmanager:us-east-1:123456789012:secret:example",
  resourceArn: "arn:aws:rds:us-east-1:123456789012:cluster:example",
  region: "local",
  serviceConfigOptions: {
    endpoint: process.env.IS_OFFLINE && "http://localhost:8080",
  },
  entities: [User],
  synchronize: true,
}

/**
* Establishes and returns a connection to the database server. If an existing
* connection is found, the connection is reused.
*
* @see https://github.com/typeorm/typeorm/issues/2598#issue-345445322
* @export
* @returns {Promise<Connection>}
*/
export async function getDatabaseConnection(): Promise<Connection> {
  try {
    console.log("Establishing connection...");
    const connectionManager = getConnectionManager();
    let connection: Connection;

    if (connectionManager.has("default")) {
      console.log("Reusing existion connection...");
      connection = injectConnectionOptions(
        connectionManager.get(),
        CONNECTION_OPTIONS,
      );
    } else {
      connection = connectionManager.create(CONNECTION_OPTIONS);
      await connection.connect();
    }

    console.log("Connection established");
    return connection;
  } catch (e) {
    console.error(e);
    throw e;
  }
};

/**
* Injects missing / outdated connection options into an existing database
* connection.
*
* @see https://github.com/typeorm/typeorm/issues/2598#issue-345445322
* @param {Connection} connection
* @param {ConnectionOptions} CONNECTION_OPTIONS
* @returns {Connection}
*/
function injectConnectionOptions(
  connection: Connection,
  CONNECTION_OPTIONS: ConnectionOptions,
): Connection {
  // @ts-ignore
  connection.options = CONNECTION_OPTIONS
  // @ts-ignore
  connection.manager = connection.createEntityManager();
  // @ts-ignore
  connection.namingStrategy = connection.options.namingStrategy ||
    new DefaultNamingStrategy();
  // @ts-ignore
  connection.relationLoader = new RelationLoader(connection);
  // @ts-ignore
  connection.relationIdLoader = new RelationIdLoader(connection);
  // @ts-ignore
  connection.buildMetadatas();

  return connection;
}

class UUIDValue implements AuroraDataAPI.CustomValue {
  private value: string;

  constructor(value: string) {
    this.value = value;
  }

  toSqlParameter(): AuroraDataAPI.SqlParameter {
    return {
      typeHint: "uuid",
      value: {
        stringValue: this.value,
      },
    };
  }
}

interface Todo {
  id: string;
  name: string;
  completedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// const dataAPI = new AuroraDataAPI({
//   region: process.env.REGION,
//   endpoint: process.env.IS_OFFLINE && "http://localhost:8080",
//   secretArn: process.env.DATA_API_SECRET_ARN ?? "",
//   resourceArn: process.env.DATA_API_RESOURCE_ARN ?? "",
//   database: process.env.DATA_API_DATABASE_NAME,
//   credentials: {
//     accessKeyId: "example",
//     secretAccessKey: "example",
//   },
// });

const data = require("data-api-client")({
  secretArn: process.env.DATA_API_SECRET_ARN ?? "",
  resourceArn: process.env.DATA_API_RESOURCE_ARN ?? "",
  database: process.env.DATA_API_DATABASE_NAME,
  options: {
    endpoint: process.env.IS_OFFLINE && "http://localhost:8080",
  },
});

export const test: AWSLambda.APIGatewayProxyHandler = async () => {
  try {
    const connection = await getDatabaseConnection();

    let user = new User();
    user.email = "abcdefxx@gmail.com";
    user.password = "testex";
    user.username = "safopax";

    const postRepository = connection.getRepository(User);
    await postRepository.save(user);

    let result = await data.query(`SELECT * FROM user`);
    console.log("result");

    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (error) {
    return handleError(error);
  }
};

// const parseEventBody = (
//   event: AWSLambda.APIGatewayEvent
// ): { [key: string]: unknown } => {
//   if (event.body === null) {
//     throw new createError.BadRequest("JSON body is required in request");
//   }
//   try {
//     return JSON.parse(event.body);
//   } catch (error) {
//     throw new createError.BadRequest(error.message);
//   }
// };

// const parseEventId = (event: AWSLambda.APIGatewayEvent): string => {
//   if (event?.pathParameters?.id === undefined) {
//     throw new createError.NotFound();
//   }
//   return event.pathParameters.id;
// };

const handleError = (error: Error): AWSLambda.APIGatewayProxyResult => {
  if (error instanceof yup.ValidationError) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: error.message,
        errors: error.errors,
      }),
    };
  }
  const statusCode =
    error instanceof createError.HttpError ? error.statusCode : 500;
  return {
    statusCode,
    body: JSON.stringify({
      message: error.message,
    }),
  };
};

// const getTodo = async (id: string): Promise<Todo> => {
//   const { rows } = await dataAPI.query<Todo>(
//     'SELECT * FROM "todos" WHERE "id" = :id LIMIT 1',
//     { id: new UUIDValue(id) }
//   );
//   if (rows === null || rows.length <= 0) {
//     throw new createError.NotFound(`Todo with ID "${id}" does not exist`);
//   }
//   return rows[0];
// };

// export const list: AWSLambda.APIGatewayProxyHandler = async () => {
//   try {
//     const { rows } = await dataAPI.query<Todo>(
//       'SELECT * FROM "todos" ORDER BY "createdAt" ASC'
//     );
//     return {
//       statusCode: 200,
//       body: JSON.stringify(rows),
//     };
//   } catch (error) {
//     return handleError(error);
//   }
// };

// export const get: AWSLambda.APIGatewayProxyHandler = async (event) => {
//   try {
//     const todo = await getTodo(parseEventId(event));
//     return {
//       statusCode: 200,
//       body: JSON.stringify(todo),
//     };
//   } catch (error) {
//     return handleError(error);
//   }
// };

// export const create: AWSLambda.APIGatewayProxyHandler = async (event) => {
//   try {
//     const { name, completedAt } = yup
//       .object({
//         name: yup.string().required(),
//         completedAt: yup.date().nullable(),
//       })
//       .validateSync(parseEventBody(event));
//     const { rows } = await dataAPI.query<Todo>(
//       'INSERT INTO "todos" ("name", "completedAt") VALUES (:name, :completedAt) RETURNING *',
//       { name, completedAt }
//     );
//     if (rows === null || rows.length <= 0) {
//       throw new createError.InternalServerError("Failed to insert");
//     }
//     return {
//       statusCode: 201,
//       body: JSON.stringify(rows[0]),
//     };
//   } catch (error) {
//     return handleError(error);
//   }
// };

// export const update: AWSLambda.APIGatewayProxyHandler = async (event) => {
//   try {
//     const todo = await getTodo(parseEventId(event));
//     const { name, completedAt } = yup
//       .object({
//         name: yup.string().default(todo.name),
//         completedAt: yup.date().nullable().default(todo.completedAt),
//       })
//       .validateSync(parseEventBody(event));
//     const { rows } = await dataAPI.query<Todo>(
//       `
//       UPDATE "todos"
//         SET
//           "name" = :name,
//           "completedAt" = :completedAt,
//           "updatedAt" = now()
//         WHERE "id" = :id
//         RETURNING *
//       `,
//       { id: new UUIDValue(todo.id), name, completedAt }
//     );
//     if (rows === null || rows.length <= 0) {
//       throw new createError.InternalServerError("Failed to update");
//     }
//     return {
//       statusCode: 200,
//       body: JSON.stringify(rows[0]),
//     };
//   } catch (error) {
//     return handleError(error);
//   }
// };

// export const remove: AWSLambda.APIGatewayProxyHandler = async (event) => {
//   try {
//     const todo = await getTodo(parseEventId(event));
//     await dataAPI.query("DELETE FROM todos WHERE id = :id", {
//       id: new UUIDValue(todo.id),
//     });
//     return {
//       statusCode: 204,
//       body: "",
//     };
//   } catch (error) {
//     return handleError(error);
//   }
// };
