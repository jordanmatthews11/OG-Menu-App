'use client';
    
import {
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  CollectionReference,
  DocumentReference,
  SetOptions,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import {FirestorePermissionError} from '@/firebase/errors';

/**
 * Initiates a setDoc operation for a document reference.
 * Does NOT await the write operation internally.
 */
type FirestoreErrorContext = { path: string; operation: 'write' | 'create' | 'update' | 'delete'; requestResourceData?: any; };

function handleFirestoreError(error: any, context: FirestoreErrorContext) {
  console.error('[Firestore error]', error?.code, error?.message, error);
  if (error?.code === 'permission-denied') {
    errorEmitter.emit('permission-error', new FirestorePermissionError(context));
  }
  // Other error types (network, quota, etc.) are logged above but not shown as permission errors.
}

export function setDocumentNonBlocking(docRef: DocumentReference, data: any, options: SetOptions) {
  setDoc(docRef, data, options).catch(error => {
    handleFirestoreError(error, { path: docRef.path, operation: 'write', requestResourceData: data });
  });
}


/**
 * Initiates an addDoc operation for a collection reference.
 * Does NOT await the write operation internally.
 * Returns the Promise for the new doc ref, but typically not awaited by caller.
 */
export function addDocumentNonBlocking(colRef: CollectionReference, data: any) {
  const promise = addDoc(colRef, data)
    .catch(error => {
      handleFirestoreError(error, { path: colRef.path, operation: 'create', requestResourceData: data });
    });
  return promise;
}


/**
 * Initiates an updateDoc operation for a document reference.
 * Does NOT await the write operation internally.
 */
export function updateDocumentNonBlocking(docRef: DocumentReference, data: any) {
  updateDoc(docRef, data)
    .catch(error => {
      handleFirestoreError(error, { path: docRef.path, operation: 'update', requestResourceData: data });
    });
}


/**
 * Initiates a deleteDoc operation for a document reference.
 * Does NOT await the write operation internally.
 */
export function deleteDocumentNonBlocking(docRef: DocumentReference) {
  deleteDoc(docRef)
    .catch(error => {
      handleFirestoreError(error, { path: docRef.path, operation: 'delete' });
    });
}