import { beforeAll, describe, expect, it } from "vitest";
import { DynamoDBClient, CreateTableCommand } from "@aws-sdk/client-dynamodb";
import { getArt69Record, putArt69Records } from "@/art69/dynamoStore";
import { Art69Record } from "@/art69/types";

const ENDPOINT = process.env.DYNAMODB_ENDPOINT ?? "http://localhost:8000";
const TABLE_NAME = process.env.ART69_TABLE_NAME ?? "open69b-art69-test";

describe.skipIf(!process.env.RUN_DYNAMO_TESTS)(
  "dynamoStore (DynamoDB Local)",
  () => {
    beforeAll(async () => {
      const client = new DynamoDBClient({
        endpoint: ENDPOINT,
        region: "us-east-1",
        credentials: { accessKeyId: "local", secretAccessKey: "local" },
      });
      try {
        await client.send(
          new CreateTableCommand({
            TableName: TABLE_NAME,
            KeySchema: [{ AttributeName: "rfc", KeyType: "HASH" }],
            AttributeDefinitions: [
              { AttributeName: "rfc", AttributeType: "S" },
            ],
            BillingMode: "PAY_PER_REQUEST",
          }),
        );
      } catch (e) {
        if (!(e as Error).name?.includes("ResourceInUseException")) throw e;
      }
    }, 30000);

    it("escribe y lee un record por RFC", async () => {
      const record: Art69Record = {
        rfc: "AAA080808HL8",
        nombre: "EMPRESA TEST",
        entries: [
          {
            listaId: "firmes",
            family: "estado",
            supuesto: "FIRMES",
            fecha: "2020-01-01",
            monto: null,
            entidadFederativa: null,
            esResolucion: false,
          },
        ],
      };
      const result = await putArt69Records([record]);
      expect(result.written).toBe(1);

      const leido = await getArt69Record("AAA080808HL8");
      expect(leido?.entries).toHaveLength(1);
      expect(leido?.entries[0].supuesto).toBe("FIRMES");
    });

    it("RFC inexistente devuelve null", async () => {
      const leido = await getArt69Record("ZZZ999999ZZ9");
      expect(leido).toBeNull();
    });

    it("batch de más de 25 records reintenta y escribe todos", async () => {
      const records: Art69Record[] = Array.from({ length: 60 }, (_, i) => ({
        rfc: `TST${String(i).padStart(6, "0")}AB1`,
        nombre: `EMPRESA ${i}`,
        entries: [
          {
            listaId: "firmes",
            family: "estado",
            supuesto: "FIRMES",
            fecha: "2020-01-01",
            monto: null,
            entidadFederativa: null,
            esResolucion: false,
          },
        ],
      }));
      const result = await putArt69Records(records);
      expect(result.written).toBe(60);

      const leido = await getArt69Record("TST000042AB1");
      expect(leido?.rfc).toBe("TST000042AB1");
    }, 30000);

    it("un segundo sync con entries NUEVAS se fusiona con las anteriores (no sobrescribe)", async () => {
      const primero: Art69Record = {
        rfc: "CCC080808HL8",
        nombre: "EMPRESA TRES",
        entries: [
          {
            listaId: "firmes",
            family: "estado",
            supuesto: "FIRMES",
            fecha: "2020-01-01",
            monto: null,
            entidadFederativa: null,
            esResolucion: false,
          },
        ],
      };
      await putArt69Records([primero]);

      // el RFC salió de Firmes: este sync solo trae la salida por diff (la
      // entrada de "firmes" no se re-parsea porque ya no está en el CSV actual)
      const segundo: Art69Record = {
        rfc: "CCC080808HL8",
        nombre: "",
        entries: [
          {
            listaId: "firmes",
            family: "estado",
            supuesto: "ELIMINADO",
            fecha: "2024-03-01",
            monto: null,
            entidadFederativa: null,
            esResolucion: true,
            esSalidaPorDiff: true,
          },
        ],
      };
      await putArt69Records([segundo]);

      const leido = await getArt69Record("CCC080808HL8");
      expect(leido?.entries).toHaveLength(2); // conserva la entrada original + añade la salida
      expect(leido?.entries.some((e) => e.supuesto === "FIRMES")).toBe(true);
      expect(leido?.entries.some((e) => e.esSalidaPorDiff)).toBe(true);
      expect(leido?.nombre).toBe("EMPRESA TRES"); // conserva el nombre si el nuevo viene vacío
    });

    it("re-escribir la MISMA entrada (RFC sigue en la lista) no la duplica", async () => {
      const record: Art69Record = {
        rfc: "DDD080808HL8",
        nombre: "EMPRESA CUATRO",
        entries: [
          {
            listaId: "firmes",
            family: "estado",
            supuesto: "FIRMES",
            fecha: "2020-01-01",
            monto: null,
            entidadFederativa: null,
            esResolucion: false,
          },
        ],
      };
      await putArt69Records([record]);
      await putArt69Records([record]); // mismo sync, dos días seguidos, RFC sigue en Firmes

      const leido = await getArt69Record("DDD080808HL8");
      expect(leido?.entries).toHaveLength(1); // no duplica
    });

    it("un record con varios entries (multi-lista) se persiste completo", async () => {
      const record: Art69Record = {
        rfc: "BBB080808HL8",
        nombre: "EMPRESA DOS",
        entries: [
          {
            listaId: "firmes",
            family: "estado",
            supuesto: "FIRMES",
            fecha: "2020-01-01",
            monto: null,
            entidadFederativa: null,
            esResolucion: false,
          },
          {
            listaId: "cancelados",
            family: "evento",
            supuesto: "CANCELADOS",
            fecha: "2023-05-01",
            monto: 1000,
            entidadFederativa: "CDMX",
            esResolucion: true,
          },
        ],
      };
      await putArt69Records([record]);
      const leido = await getArt69Record("BBB080808HL8");
      expect(leido?.entries).toHaveLength(2);
    });
  },
);
