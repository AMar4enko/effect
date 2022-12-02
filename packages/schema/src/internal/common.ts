/**
 * @since 1.0.0
 */

import * as C from "@fp-ts/data/Chunk"
import { pipe } from "@fp-ts/data/Function"
import type { Json, JsonArray, JsonObject } from "@fp-ts/data/Json"
import type { Option } from "@fp-ts/data/Option"
import * as O from "@fp-ts/data/Option"
import type { Refinement } from "@fp-ts/data/Predicate"
import * as T from "@fp-ts/data/These"
import type { Arbitrary } from "@fp-ts/schema/Arbitrary"
import type { AST } from "@fp-ts/schema/AST"
import * as ast from "@fp-ts/schema/AST"
import type { UnknownObject } from "@fp-ts/schema/data/UnknownObject"
import * as DE from "@fp-ts/schema/DecodeError"
import type { Decoder } from "@fp-ts/schema/Decoder"
import type { Encoder } from "@fp-ts/schema/Encoder"
import type { Guard } from "@fp-ts/schema/Guard"
import type { Provider } from "@fp-ts/schema/Provider"
import * as P from "@fp-ts/schema/Provider"
import type { Schema } from "@fp-ts/schema/Schema"

export const isUnknownObject = (u: unknown): u is UnknownObject =>
  typeof u === "object" && u != null && !Array.isArray(u)

export const isJsonArray = (u: unknown): u is JsonArray => Array.isArray(u) && u.every(isJson)

export const isJsonObject = (u: unknown): u is JsonObject =>
  isUnknownObject(u) && Object.keys(u).every((key) => isJson(u[key]))

export const isJson = (u: unknown): u is Json =>
  u === null || typeof u === "string" || typeof u === "number" || typeof u === "boolean" ||
  isJsonArray(u) ||
  isJsonObject(u)

export const GuardId: unique symbol = Symbol.for(
  "@fp-ts/schema/Guard"
)

export const ArbitraryId: unique symbol = Symbol.for(
  "@fp-ts/schema/Arbitrary"
)

export const JsonDecoderId: unique symbol = Symbol.for(
  "@fp-ts/schema/JsonDecoder"
)

export const UnknownDecoderId: unique symbol = Symbol.for(
  "@fp-ts/schema/UnknownDecoder"
)

export const JsonEncoderId: unique symbol = Symbol.for(
  "@fp-ts/schema/JsonEncoder"
)

export const UnknownEncoderId: unique symbol = Symbol.for(
  "@fp-ts/schema/UnknownEncoder"
)

export const makeSchema = <A>(ast: AST): Schema<A> => ({ ast }) as any

export const declareSchema = <Schemas extends ReadonlyArray<Schema<any>>>(
  id: symbol,
  config: Option<unknown>,
  provider: Provider,
  ...schemas: Schemas
): Schema<any> => makeSchema(ast.declare(id, config, provider, schemas.map((s) => s.ast)))

export const makeArbitrary = <A>(
  schema: Schema<A>,
  arbitrary: Arbitrary<A>["arbitrary"]
): Arbitrary<A> => ({ ast: schema.ast, arbitrary }) as any

export const makeDecoder = <I, A>(
  schema: Schema<A>,
  decode: Decoder<I, A>["decode"]
): Decoder<I, A> => ({ ast: schema.ast, decode }) as any

export const succeed: <A>(a: A) => T.These<never, A> = T.right

export const fail = (e: DE.DecodeError): T.Validated<DE.DecodeError, never> =>
  T.left(C.singleton(e))

export const warn = <A>(e: DE.DecodeError, a: A): T.Validated<DE.DecodeError, A> =>
  T.both(C.singleton(e), a)

export const flatMap = T.flatMap

export const compose = <B, C>(bc: Decoder<B, C>) =>
  <A>(ab: Decoder<A, B>): Decoder<A, C> =>
    makeDecoder(bc, (a) => pipe(ab.decode(a), flatMap(bc.decode)))

export const fromRefinement = <A>(
  schema: Schema<A>,
  refinement: (u: unknown) => u is A,
  onFalse: (u: unknown) => DE.DecodeError
): Decoder<unknown, A> => makeDecoder(schema, (u) => refinement(u) ? succeed(u) : fail(onFalse(u)))

export const makeGuard = <A>(
  schema: Schema<A>,
  is: Guard<A>["is"]
): Guard<A> => ({ ast: schema.ast, is }) as any

export const makeEncoder = <O, A>(
  schema: Schema<A>,
  encode: Encoder<O, A>["encode"]
): Encoder<O, A> => ({ ast: schema.ast, encode }) as any

export const refine = <A, B extends A>(id: symbol, refinement: Refinement<A, B>) =>
  (schema: Schema<A>): Schema<B> => {
    const arbitrary = (self: Arbitrary<A>): Arbitrary<B> =>
      makeArbitrary(Schema, (fc) => self.arbitrary(fc).filter(refinement))
    const guard = (self: Guard<A>): Guard<B> =>
      makeGuard(Schema, (u): u is A => self.is(u) && refinement(u))
    const decoder = <I>(self: Decoder<I, A>): Decoder<I, B> =>
      makeDecoder(
        Schema,
        (i) =>
          pipe(
            self.decode(i),
            flatMap((a) => refinement(a) ? succeed(a) : fail(DE.custom({}, a)))
          )
      )
    const encoder = <I>(self: Encoder<I, A>): Encoder<I, B> =>
      makeEncoder(Schema, (b) => self.encode(b))
    const Provider: P.Provider = P.make(id, {
      [ArbitraryId]: arbitrary,
      [GuardId]: guard,
      [JsonDecoderId]: decoder,
      [UnknownDecoderId]: decoder,
      [JsonEncoderId]: encoder,
      [UnknownEncoderId]: encoder
    })
    const Schema = declareSchema(id, O.none, Provider, schema)
    return Schema
  }
