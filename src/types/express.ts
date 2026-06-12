import type { Request, Response, NextFunction } from "express";

export interface AppRequest extends Request {}
export interface AppResponse extends Response {}
export interface AppNextFunction extends NextFunction {}
